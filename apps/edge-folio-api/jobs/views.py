import logging
import re

from django.core.cache import cache
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from applications.models import JobApplication
from applications.serializers import JobApplicationSerializer
from applications.views import _assign_company, _invalidate_application

from .models import JobPosting, JobSearch, UserApiCredential
from .serializers import JobFeedSerializer, JobSearchSerializer, UserApiCredentialSerializer

logger = logging.getLogger(__name__)

CACHE_TTL = 300
_MAX_CANDIDATES = 500
_DEFAULT_PER_PAGE = 20
_MAX_PER_PAGE = 100
_RECENT_SEARCHES = 3
_TOKEN_RE = re.compile(r'[a-z0-9+#.]+')


def _invalidate_feed(user_id):
    cache.delete(f'jobs:feed:{user_id}')


def _invalidate_searches(user_id):
    cache.delete(f'jobs:searches:{user_id}')


def _invalidate_credentials(user_id):
    cache.delete(f'jobs:credentials:{user_id}')


def _ranking_terms(user):
    """Build the term sets used to score postings against the user's profile."""
    from matrix.models import Skill

    stack_terms: set[str] = set()
    title_tokens: set[str] = set()
    try:
        profile = user.profile
    except Exception:
        profile = None

    if profile is not None:
        for tech in profile.preferred_stack.all():
            stack_terms.add(tech.name.lower())
        title_tokens.update(_TOKEN_RE.findall(profile.job_title.lower()))

    for name in Skill.objects.filter(user=user).values_list('name', flat=True):
        stack_terms.add(name.lower())

    stack_terms.discard('')
    title_tokens.discard('')
    return stack_terms, title_tokens


def _score(posting, stack_terms, title_tokens) -> int:
    haystack = ' '.join([
        posting.job_title or '',
        posting.job_description or '',
        ' '.join(posting.tags or []),
    ]).lower()
    score = 0
    for term in stack_terms:
        if term in haystack:
            score += 2
    title = (posting.job_title or '').lower()
    for token in title_tokens:
        if token in title:
            score += 3
    return score


class JobFeedView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        cache_key = f'jobs:feed:{user.id}'
        ranked = cache.get(cache_key)
        if ranked is None:
            ranked = self._build_ranked(user)
            cache.set(cache_key, ranked, CACHE_TTL)

        items = self._apply_filters(ranked, request.query_params)

        try:
            per = min(_MAX_PER_PAGE, max(1, int(request.query_params.get('per', _DEFAULT_PER_PAGE))))
            page = max(1, int(request.query_params.get('page', 1)))
        except (TypeError, ValueError):
            per, page = _DEFAULT_PER_PAGE, 1

        count = len(items)
        start = (page - 1) * per
        page_items = items[start:start + per]
        return Response({
            'count': count,
            'page': page,
            'per': per,
            'results': page_items,
        })

    def _build_ranked(self, user):
        now = timezone.now()
        postings = list(
            JobPosting.objects
            .filter(expires_at__gt=now)
            .filter(Q(is_private=False) | Q(owner=user))
        )

        stack_terms, title_tokens = _ranking_terms(user)

        # Map saved applications back to their source posting / url so the feed
        # can flag postings the user has already saved.
        saved_by_posting: dict[int, int] = {}
        saved_by_url: dict[str, int] = {}
        for app_id, url, posting_id in JobApplication.objects.filter(user=user).values_list(
            'id', 'job_url', 'source_posting_id'
        ):
            if posting_id:
                saved_by_posting[posting_id] = app_id
            if url:
                saved_by_url[url] = app_id

        scored = []
        for posting in postings:
            scored.append((_score(posting, stack_terms, title_tokens), posting))
        scored.sort(key=lambda pair: (pair[0], pair[1].created), reverse=True)
        scored = scored[:_MAX_CANDIDATES]

        serializer = JobFeedSerializer([p for _, p in scored], many=True)
        results = []
        for (score, posting), data in zip(scored, serializer.data):
            item = dict(data)
            item['score'] = score
            item['saved_application_id'] = (
                saved_by_posting.get(posting.id) or saved_by_url.get(posting.job_url)
            )
            item['is_owner'] = posting.owner_id == user.id
            results.append(item)
        return results

    def _apply_filters(self, ranked, params):
        country = params.get('country')
        work_type = params.get('work_type')
        scope = params.get('scope')
        search = params.get('search')
        q = (params.get('q') or '').strip().lower()

        items = ranked
        # A private posting in the feed is always owned by the requesting user
        # (the queryset is is_private=False OR owner=user), so is_private alone
        # separates the owned list from the shared catalog.
        if scope == 'private':
            items = [p for p in items if p['is_private']]
        elif scope == 'shared':
            items = [p for p in items if not p['is_private']]
        # Restrict to a single JobSearch run (only private postings carry a search).
        if search:
            items = [p for p in items if str(p.get('search')) == search]
        if country:
            items = [p for p in items if p['country'] == country]
        if work_type:
            items = [p for p in items if work_type in (p['work_type'] or [])]
        if q:
            items = [
                p for p in items
                if q in (p['job_title'] or '').lower() or q in (p['company_name'] or '').lower()
            ]
        return items


class FetchJobsView(APIView):
    """On-demand job fetch.

    Staff trigger the shared catalog ingest. Any user with an active BYOK
    credential triggers a private feed fetch billed to their own key (Adzuna
    first, JSearch as fallback). Either way the task runs on Celery and returns
    immediately; postings appear in the feed once a worker processes it.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        from django.db import IntegrityError

        from .tasks import ingest_shared_catalog, ingest_user_feed, select_user_credential

        if request.user.is_staff:
            ingest_shared_catalog.delay()
            return Response(
                {'detail': 'Shared catalog fetch started.'},
                status=status.HTTP_202_ACCEPTED,
            )

        # Only one fetch may run at a time per user: it owns the LLM scoring queue
        # and the polling UI keys off a single active search.
        if JobSearch.objects.filter(user=request.user, status='running').exists():
            return Response(
                {'detail': 'A job search is already running. Please wait for it to finish.'},
                status=status.HTTP_409_CONFLICT,
            )

        credential = select_user_credential(request.user.id)
        if credential is None:
            return Response(
                {'detail': 'No API key with remaining quota. Add a key or wait for the daily limit to reset.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            search = JobSearch.objects.create(user=request.user, status='running')
        except IntegrityError:
            # Lost a race against a concurrent fetch that created the running row first.
            return Response(
                {'detail': 'A job search is already running. Please wait for it to finish.'},
                status=status.HTTP_409_CONFLICT,
            )

        _invalidate_searches(request.user.id)
        ingest_user_feed.delay(request.user.id, search.id)
        return Response(
            {'detail': 'Job fetch started.', 'search_id': search.id},
            status=status.HTTP_202_ACCEPTED,
        )


class JobSearchListView(APIView):
    """The user's most recent fetch runs (newest first), for the jobs-page card.

    Returns the last few searches so the UI can show progress
    (``metrics_completed / jobs_found``) and poll until none are ``running``.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        cache_key = f'jobs:searches:{request.user.id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        # Tally each run's postings into the same buckets the jobs page renders:
        # a citizenship requirement, an unmet spoken-language requirement, a missing
        # score, or a score below 60 is "low"; 85+ is "strong"; 60-84 is "possible". A
        # single LEFT JOIN with conditional counts avoids an N+1 over the related postings.
        # A gate fires only when the flag is explicitly True; NULL (not yet scored for
        # the gate) counts as "not gated", matching the jobs-page truthiness check.
        gated = Q(postings__us_citizen_or_pr_required=True) | Q(postings__language_requirement_unmet=True)
        not_gated = (
            (Q(postings__us_citizen_or_pr_required=False) | Q(postings__us_citizen_or_pr_required__isnull=True))
            & (Q(postings__language_requirement_unmet=False) | Q(postings__language_requirement_unmet__isnull=True))
        )
        searches = (
            JobSearch.objects.filter(user=request.user)
            .annotate(
                strong=Count(
                    'postings',
                    filter=not_gated & Q(postings__overall_match__gte=85),
                ),
                possible=Count(
                    'postings',
                    filter=not_gated
                    & Q(postings__overall_match__gte=60)
                    & Q(postings__overall_match__lt=85),
                ),
                low=Count(
                    'postings',
                    filter=gated
                    | Q(postings__overall_match__isnull=True)
                    | Q(postings__overall_match__lt=60),
                ),
            )
            # annotate() injects a GROUP BY that drops the model's default
            # `-created` ordering, so the slice would otherwise grab the oldest
            # rows. Re-apply it explicitly to keep the newest runs.
            .order_by('-created')[:_RECENT_SEARCHES]
        )
        data = JobSearchSerializer(searches, many=True).data
        cache.set(cache_key, data, CACHE_TTL)
        return Response(data)


class SaveJobView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            posting = JobPosting.objects.get(pk=pk)
        except JobPosting.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Private postings belong to a single user.
        if posting.is_private and posting.owner_id != request.user.id:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Reuse the existing (user, job_url) uniqueness to dedupe saves.
        if posting.job_url:
            existing = JobApplication.objects.filter(
                user=request.user, job_url=posting.job_url
            ).select_related('company').first()
            if existing is not None:
                serializer = JobApplicationSerializer(existing, context={'request': request})
                return Response(serializer.data, status=status.HTTP_200_OK)

        application = JobApplication.objects.create(
            user=request.user,
            company_name=posting.company_name,
            job_title=posting.job_title,
            job_description=posting.job_description,
            job_url=posting.job_url,
            status='draft',
            salary_min=posting.salary_min,
            salary_max=posting.salary_max,
            salary_currency=posting.salary_currency,
            work_type=posting.work_type,
            location=posting.location,
            source_posting=posting,
        )

        try:
            _assign_company(application)
        except Exception as exc:
            logger.warning('Company assignment failed for saved posting %s: %s', pk, exc)

        _invalidate_application(request.user.id)
        _invalidate_feed(request.user.id)

        serializer = JobApplicationSerializer(application, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DeleteJobView(APIView):
    """Delete a job posting.

    Staff may delete any posting from the shared catalog. A regular user may
    delete only their own private postings (those fetched with their BYOK key).
    """

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            posting = JobPosting.objects.get(pk=pk)
        except JobPosting.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_owner = posting.owner_id == request.user.id
        if not (request.user.is_staff or is_owner):
            # Don't disclose existence of postings the caller can't act on.
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        posting.delete()
        # The owner's feed is cached; bust it so the posting disappears at once.
        if is_owner:
            _invalidate_feed(request.user.id)
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserApiCredentialListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserApiCredentialSerializer
    # At most one credential per provider - return a plain list, not a paginated page.
    pagination_class = None

    def get_queryset(self):
        return UserApiCredential.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        cache_key = f'jobs:credentials:{request.user.id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        _invalidate_credentials(request.user.id)
        return response


class UserApiCredentialDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = UserApiCredentialSerializer

    def get_queryset(self):
        return UserApiCredential.objects.filter(user=self.request.user)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        _invalidate_credentials(request.user.id)
        return response

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        _invalidate_credentials(request.user.id)
        return response
