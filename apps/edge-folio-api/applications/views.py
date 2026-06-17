import logging

from django.core.cache import cache
from django.db import IntegrityError
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from career.models import Education, WorkExperience
from matrix.models import BulletPoint

from .metrics import sync_posting_metrics
from .models import Company, JobApplication, _normalize_company_name
from .scoring import compute_match_metrics
from .serializers import JobApplicationSerializer
from .tailoring import (
    generate_cover_letter,
    generate_nafta_letter,
    suggest_tn_categories,
)

logger = logging.getLogger(__name__)

CACHE_TTL = 300


def _invalidate_application(user_id, pk=None):
    cache.delete(f'applications:applications:{user_id}')
    if pk is not None:
        cache.delete(f'applications:application:{user_id}:{pk}')


def _assign_company(application: JobApplication) -> None:
    norm = _normalize_company_name(application.company_name)
    if not norm:
        return
    try:
        company, created = Company.objects.get_or_create(
            normalized_name=norm,
            defaults={'name': application.company_name, 'status': 'pending'},
        )
    except IntegrityError:
        company = Company.objects.get(normalized_name=norm)
        created = False

    application.company = company
    application.save(update_fields=['company', 'modified'])

    if created:
        from .tasks import run_company_pipeline
        run_company_pipeline.delay(company.pk)


class JobApplicationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JobApplicationSerializer

    def get_queryset(self):
        return (
            JobApplication.objects
            .filter(user=self.request.user)
            .select_related('company')
        )

    def list(self, request, *args, **kwargs):
        cache_key = f'applications:applications:{request.user.id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        app_id = response.data.get('id')
        if app_id:
            try:
                application = JobApplication.objects.select_related('company').get(pk=app_id)
                _assign_company(application)
                serializer = self.get_serializer(application)
                response.data = serializer.data
            except Exception as exc:
                logger.warning('Company assignment failed for application %s: %s', app_id, exc)
        _invalidate_application(request.user.id)
        return response


class JobApplicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JobApplicationSerializer

    def get_queryset(self):
        return (
            JobApplication.objects
            .filter(user=self.request.user)
            .select_related('company')
        )

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = f'applications:application:{request.user.id}:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        old_company_name = instance.company_name
        response = super().update(request, *args, **kwargs)
        pk = kwargs.get('pk')
        instance.refresh_from_db()
        new_company_name = request.data.get('company_name', old_company_name)
        if new_company_name != old_company_name:
            try:
                _assign_company(instance)
                serializer = self.get_serializer(instance)
                response.data = serializer.data
            except Exception as exc:
                logger.warning('Company re-assignment failed for application %s: %s', pk, exc)
        _invalidate_application(request.user.id, pk)
        # An edit can change us_citizen_or_pr_required, which moves the source
        # posting's jobs-page bucket; keep its mirrored fields in sync.
        sync_posting_metrics(instance)
        return response

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        response = super().destroy(request, *args, **kwargs)
        _invalidate_application(request.user.id, pk)
        return response


class TailorApplicationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            application = JobApplication.objects.select_related('company').get(pk=pk, user=request.user)
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        if application.tailor_status == 'processing':
            return Response({'status': 'processing'}, status=status.HTTP_202_ACCEPTED)

        if not BulletPoint.objects.filter(user=request.user, is_approved=True).exists():
            return Response(
                {'detail': 'No approved bullet points in your matrix.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from django.utils import timezone

        from .tasks import run_tailor_pipeline

        application.tailor_status = 'processing'
        application.tailor_started_at = timezone.now()
        application.save(update_fields=['tailor_status', 'tailor_started_at', 'modified'])
        _invalidate_application(request.user.id, pk)

        run_tailor_pipeline.delay(application.pk)

        application.refresh_from_db(fields=['tailor_status'])
        return Response({'status': application.tailor_status}, status=status.HTTP_202_ACCEPTED)


class CoverLetterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            application = JobApplication.objects.select_related('company').get(pk=pk, user=request.user)
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        bullets = request.data.get('bullets', [])
        if not bullets:
            return Response(
                {'detail': 'At least one tailored bullet is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not isinstance(bullets, list) or not all(
            isinstance(b, dict) and 'tailored_text' in b for b in bullets
        ):
            return Response(
                {'detail': 'bullets must be a list of objects with tailored_text.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        company_name = application.company.name if application.company_id else application.company_name

        try:
            cover_letter = generate_cover_letter(
                job_title=application.job_title,
                company_name=company_name,
                job_description=application.job_description,
                tailored_bullets=bullets,
            )
        except Exception as exc:
            logger.error('LLM error during cover letter generation: %s', exc)
            return Response(
                {'detail': 'LLM service unavailable. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        application.cover_letter = cover_letter
        application.save(update_fields=['cover_letter', 'modified'])
        _invalidate_application(request.user.id, pk)

        return Response({'cover_letter': cover_letter})


class NaftaLetterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            application = JobApplication.objects.select_related('company').get(pk=pk, user=request.user)
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        full_name = f'{user.first_name} {user.last_name}'.strip() or user.email
        company_name = application.company.name if application.company_id else application.company_name

        try:
            current_job_title = user.profile.job_title
        except Exception:
            current_job_title = ''

        from career.models import Education, WorkExperience
        education = Education.objects.filter(user=user).order_by('-start_year').first()
        work_experiences = list(
            WorkExperience.objects.filter(user=user)
            .order_by('-start_date')
            .values('company', 'title', 'start_date', 'end_date', 'is_current', 'location')
        )

        data = request.data
        try:
            hours_raw = data.get('hours_per_week', 40)
            try:
                hours_per_week = int(hours_raw)
            except (TypeError, ValueError):
                hours_per_week = 40

            nafta_letter = generate_nafta_letter(
                job_title=application.job_title,
                company_name=company_name,
                job_description=application.job_description,
                full_name=full_name,
                current_job_title=current_job_title,
                degree=education.degree if education else '',
                institution=education.institution if education else '',
                field_of_study=education.field_of_study if education else '',
                tn_profession=data.get('tn_profession', ''),
                is_continuation=bool(data.get('is_continuation', False)),
                company_description=data.get('company_description', ''),
                hours_per_week=hours_per_week,
                duration=data.get('duration', '3 years'),
                passport_number=data.get('passport_number', ''),
                date_of_birth=data.get('date_of_birth', ''),
                citizenship=data.get('citizenship', ''),
                work_experiences=work_experiences,
            )
        except Exception as exc:
            logger.error('LLM error during NAFTA letter generation: %s', exc)
            return Response(
                {'detail': 'LLM service unavailable. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        application.nafta_letter = nafta_letter
        application.save(update_fields=['nafta_letter', 'modified'])
        _invalidate_application(request.user.id, pk)

        return Response({'nafta_letter': nafta_letter})


class RefreshMetricsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            application = (
                JobApplication.objects
                .select_related('company', 'source_posting')
                .get(pk=pk, user=request.user)
            )
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        company_name = application.company.name if application.company_id else application.company_name

        try:
            metrics = compute_match_metrics(
                user=user,
                job_description=application.job_description,
                job_title=application.job_title,
                company_name=company_name,
            )
        except Exception as exc:
            logger.error('LLM error during metrics refresh: %s', exc)
            return Response(
                {'detail': 'LLM service unavailable. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        application.overall_match = metrics['overall_match']
        application.overall_match_explanation = metrics['overall_match_explanation']
        application.technical_match = metrics['technical_match']
        application.technical_match_explanation = metrics['technical_match_explanation']
        application.nafta_tn_likelihood = metrics['nafta_tn_likelihood']
        application.nafta_tn_likelihood_explanation = metrics['nafta_tn_likelihood_explanation']
        application.language_requirement_unmet = metrics['language_requirement_unmet']
        application.save(update_fields=[
            'overall_match', 'overall_match_explanation',
            'technical_match', 'technical_match_explanation',
            'nafta_tn_likelihood', 'nafta_tn_likelihood_explanation',
            'language_requirement_unmet', 'modified',
        ])
        _invalidate_application(user.id, pk)

        # Mirror the refreshed scores onto the posting this application was saved from,
        # so the jobs feed bucket and per-search tally show the same up-to-date metrics.
        # The posting is owner-scoped (private BYOK result), so writing the per-user
        # score onto the row is safe.
        sync_posting_metrics(application)

        return Response(metrics)


class TnSuggestView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        work_experiences = list(
            WorkExperience.objects.filter(user=user)
            .order_by('-start_date')
            .values('company', 'title', 'start_date', 'end_date', 'is_current', 'description')
        )
        educations = list(
            Education.objects.filter(user=user)
            .order_by('-start_year')
            .values('institution', 'degree', 'field_of_study', 'start_year', 'end_year', 'description')
        )

        if not work_experiences and not educations:
            return Response(
                {'detail': 'No education or work experience found. Please add some to your profile first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            suggestions = suggest_tn_categories(work_experiences, educations)
        except (ValueError, KeyError) as exc:
            logger.error('TN suggest parse error: %s', exc)
            return Response(
                {'detail': 'Unexpected response from LLM. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({'suggestions': suggestions})
