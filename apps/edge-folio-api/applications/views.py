import logging

import requests
from django.conf import settings
from django.core.cache import cache
from django.core.files.base import ContentFile
from pydantic import BaseModel
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from career.models import Education, Project, WorkExperience
from edge_folio_api.llm import chat_structured
from matrix.models import BulletPoint, Skill

from .models import JobApplication
from .serializers import JobApplicationSerializer
from .tailoring import (
    calculate_nafta_likelihood,
    calculate_overall_match,
    calculate_technical_match,
    generate_cover_letter,
    generate_nafta_letter,
    suggest_tn_categories,
    tailor_full_resume,
)


class _PickURLResult(BaseModel):
    url: str


class _AboutResult(BaseModel):
    about: str


class _CompanyIntelItem(BaseModel):
    title: str
    summary: str
    url: str
    source: str


class _CompanyIntelResult(BaseModel):
    items: list[_CompanyIntelItem]

logger = logging.getLogger(__name__)

CACHE_TTL = 300


def _invalidate_application(user_id, pk=None):
    cache.delete(f'applications:applications:{user_id}')
    if pk is not None:
        cache.delete(f'applications:application:{user_id}:{pk}')


class JobApplicationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JobApplicationSerializer

    def get_queryset(self):
        return JobApplication.objects.filter(user=self.request.user)

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
        _invalidate_application(request.user.id)
        return response


class JobApplicationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = JobApplicationSerializer

    def get_queryset(self):
        return JobApplication.objects.filter(user=self.request.user)

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
        response = super().update(request, *args, **kwargs)
        _invalidate_application(request.user.id, kwargs.get('pk'))
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
            application = JobApplication.objects.get(pk=pk, user=request.user)
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        approved_bullets = (
            BulletPoint.objects.filter(user=request.user, is_approved=True)
            .prefetch_related('skills')
        )
        if not approved_bullets.exists():
            return Response(
                {'detail': 'No approved bullet points in your matrix.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        skills_payload = list(
            Skill.objects.filter(user=request.user).values('id', 'name', 'proficiency')
        )

        work_experiences = list(
            WorkExperience.objects.filter(user=request.user)
            .order_by('-start_date')
            .values('id', 'title', 'company', 'start_date', 'end_date', 'is_current', 'description')
        )
        we_map = {we['id']: we for we in work_experiences}

        projects_qs = Project.objects.filter(user=request.user).prefetch_related('tech_stack')
        projects_payload = [
            {
                'id': p.id,
                'name': p.name,
                'description': p.description,
                'tech_stack': [t.name for t in p.tech_stack.all()],
            }
            for p in projects_qs
        ]

        bullet_category = {b.id: b.category for b in approved_bullets}
        bullet_we_id = {b.id: b.work_experience_id for b in approved_bullets}

        bullets_payload = [
            {
                'id': b.id,
                'text': b.text,
                'category': b.category,
                'skills': [s.name for s in b.skills.all()],
                'work_experience_title': we_map[b.work_experience_id]['title'] if b.work_experience_id and b.work_experience_id in we_map else None,
                'work_experience_company': we_map[b.work_experience_id]['company'] if b.work_experience_id and b.work_experience_id in we_map else None,
            }
            for b in approved_bullets
        ]

        profile_job_title = ''
        try:
            profile_job_title = request.user.profile.job_title or ''
        except Exception:
            pass

        try:
            result = tailor_full_resume(
                job_title=application.job_title,
                company_name=application.company_name,
                job_description=application.job_description,
                bullets=bullets_payload,
                skills=skills_payload,
                work_experiences=work_experiences,
                projects=projects_payload,
                profile_job_title=profile_job_title,
            )
        except Exception as exc:
            logger.error('LLM error during full resume tailoring: %s', exc)
            return Response(
                {'detail': 'LLM service unavailable. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        tailored = result['bullets']
        for bullet in tailored:
            bullet['category'] = bullet_category.get(bullet.get('id'), 'other')
            bullet['work_experience_id'] = bullet_we_id.get(bullet.get('id'))

        application.tailored_bullets = tailored
        application.tailored_work_experiences = result['work_experiences']
        application.tailored_projects = result['projects']
        application.professional_summary = result['summary']
        application.save(update_fields=[
            'tailored_bullets', 'tailored_work_experiences', 'tailored_projects',
            'professional_summary', 'modified',
        ])
        application.tailored_skills.set(
            Skill.objects.filter(id__in=result['skill_ids'], user=request.user)
        )
        _invalidate_application(request.user.id, pk)

        tailored_skills_data = list(
            application.tailored_skills.order_by('name').values('id', 'name', 'proficiency')
        )
        return Response({
            'bullets': tailored,
            'tailored_work_experiences': result['work_experiences'],
            'tailored_projects': result['projects'],
            'professional_summary': result['summary'],
            'tailored_skills': tailored_skills_data,
        })


class CoverLetterView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            application = JobApplication.objects.get(pk=pk, user=request.user)
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

        try:
            cover_letter = generate_cover_letter(
                job_title=application.job_title,
                company_name=application.company_name,
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
            application = JobApplication.objects.get(pk=pk, user=request.user)
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        full_name = f'{user.first_name} {user.last_name}'.strip() or user.email

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
                company_name=application.company_name,
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
            application = JobApplication.objects.get(pk=pk, user=request.user)
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        user = request.user
        bullets_qs = list(
            BulletPoint.objects.filter(user=user, is_approved=True).prefetch_related('skills')
        )
        bullets_payload = [
            {
                'id': b.id,
                'text': b.text,
                'category': b.category,
                'skills': [s.name for s in b.skills.all()],
            }
            for b in bullets_qs
        ]
        skills = list(Skill.objects.filter(user=user).values('name', 'proficiency'))
        work_experiences = list(
            WorkExperience.objects.filter(user=user)
            .order_by('-start_date')
            .values('company', 'title', 'start_date', 'end_date', 'is_current', 'location')
        )
        educations = list(
            Education.objects.filter(user=user)
            .order_by('-start_year')
            .values('institution', 'degree', 'field_of_study', 'start_year', 'end_year')
        )

        try:
            overall, overall_explanation = calculate_overall_match(
                job_description=application.job_description,
                job_title=application.job_title,
                company_name=application.company_name,
                bullets=bullets_payload,
                skills=skills,
            )
            technical, technical_explanation = calculate_technical_match(
                job_description=application.job_description,
                job_title=application.job_title,
                company_name=application.company_name,
                bullets=bullets_payload,
                skills=skills,
            )
            nafta, nafta_explanation = calculate_nafta_likelihood(
                job_description=application.job_description,
                job_title=application.job_title,
                skills=skills,
                work_experiences=work_experiences,
                educations=educations,
            )
        except Exception as exc:
            logger.error('LLM error during metrics refresh: %s', exc)
            return Response(
                {'detail': 'LLM service unavailable. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        application.overall_match = overall
        application.overall_match_explanation = overall_explanation
        application.technical_match = technical
        application.technical_match_explanation = technical_explanation
        application.nafta_tn_likelihood = nafta
        application.nafta_tn_likelihood_explanation = nafta_explanation
        application.save(update_fields=[
            'overall_match', 'overall_match_explanation',
            'technical_match', 'technical_match_explanation',
            'nafta_tn_likelihood', 'nafta_tn_likelihood_explanation',
            'modified',
        ])
        _invalidate_application(user.id, pk)

        return Response({
            'overall_match': overall,
            'overall_match_explanation': overall_explanation,
            'technical_match': technical,
            'technical_match_explanation': technical_explanation,
            'nafta_tn_likelihood': nafta,
            'nafta_tn_likelihood_explanation': nafta_explanation,
        })


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


_PICK_URL_SYSTEM_PROMPT = """\
You are a research assistant. Given web search results for a company, pick the single best URL \
that is the company's official website homepage or about page. Prefer the company's own domain \
over third-party sources (LinkedIn, Crunchbase, news articles, etc.).

Return ONLY valid JSON — no markdown, no explanation: {"url": "<chosen url>"}
"""

_EXTRACT_ABOUT_SYSTEM_PROMPT = """\
You are a research assistant. From the provided webpage content, extract a concise company \
description (2-4 sentences). Focus on what the company does, their mission, products/services, \
and industry. Write in third-person present tense suitable for a formal letter.

Return ONLY valid JSON — no markdown, no explanation: {"about": "<extracted description>"}
"""

_INTEL_SYSTEM_PROMPT = """\
You are a research assistant. Given web search results about a company, extract up to 3 of the \
most relevant and informative items. For each item provide: a concise title, a 1-2 sentence \
summary of the content, the exact URL, and the source domain (e.g. "techcrunch.com").

Only include items that are clearly relevant and informative. Return fewer than 3 if quality \
results are limited. Return an empty list if nothing is relevant.

Return ONLY valid JSON — no markdown, no explanation:
{"items": [{"title": "...", "summary": "...", "url": "...", "source": "..."}]}
"""


def _scraper_post(endpoint: str, payload: dict) -> dict:
    """POST to the scraper service and return parsed JSON."""
    url = f"{settings.SCRAPER_URL.rstrip('/')}/{endpoint.lstrip('/')}"
    headers = {'Content-Type': 'application/json'}
    if settings.SCRAPER_API_KEY:
        headers['X-API-Key'] = settings.SCRAPER_API_KEY
    resp = requests.post(url, json=payload, headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.json()


class SearchCompanyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            application = JobApplication.objects.get(pk=pk, user=request.user)
        except JobApplication.DoesNotExist:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        company_name = application.company_name

        # 1. Search for the company
        try:
            search_results = _scraper_post('/search', {
                'query': f'{company_name} official website about company',
                'maxResults': 5,
            })
        except Exception as exc:
            logger.error('Scraper /search failed: %s', exc)
            return Response(
                {'detail': 'Search service unavailable. Please try again later.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        results = search_results if isinstance(search_results, list) else search_results.get('results', [])
        if not results:
            return Response(
                {'detail': 'No search results found for this company.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 2. Use LLM to pick the best URL
        results_text = "\n".join(
            f"- {r.get('title', '')} | {r.get('url', '')} | {r.get('snippet', '')}"
            for r in results
        )
        try:
            pick_result = chat_structured(
                messages=[
                    {"role": "system", "content": _PICK_URL_SYSTEM_PROMPT},
                    {"role": "user", "content": f"COMPANY: {company_name}\n\nSEARCH RESULTS:\n{results_text}\n\nPick the best URL."},
                ],
                response_model=_PickURLResult,
                temperature=0.1,
            )
            chosen_url = pick_result.url
        except Exception as exc:
            logger.error('LLM URL pick failed: %s', exc)
            chosen_url = results[0].get('url', '')

        if not chosen_url:
            return Response(
                {'detail': 'Could not determine a company URL from search results.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        # 3. Extract content from the chosen URL
        try:
            extract_result = _scraper_post('/extract', {'url': chosen_url})
        except Exception as exc:
            logger.error('Scraper /extract failed for %s: %s', chosen_url, exc)
            return Response(
                {'detail': 'Failed to extract company page. Please try again.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        content = extract_result.get('content', '')
        og_image = extract_result.get('og_image')

        # 4. Use LLM to extract company about text
        try:
            about_result = chat_structured(
                messages=[
                    {"role": "system", "content": _EXTRACT_ABOUT_SYSTEM_PROMPT},
                    {"role": "user", "content": f"COMPANY: {company_name}\n\nPAGE CONTENT:\n{content[:4000]}"},
                ],
                response_model=_AboutResult,
                temperature=0.2,
            )
            about_text = about_result.about
        except Exception as exc:
            logger.error('LLM about extraction failed: %s', exc)
            about_text = ''

        # 5. Download og_image if present and save as company_image
        company_image_url = None
        if og_image:
            try:
                img_resp = requests.get(og_image, timeout=15)
                img_resp.raise_for_status()
                content_type = img_resp.headers.get('Content-Type', 'image/jpeg')
                if 'svg' in content_type:
                    logger.warning('Skipping SVG og_image from %s', og_image)
                else:
                    ext = 'jpg'
                    if 'png' in content_type:
                        ext = 'png'
                    elif 'webp' in content_type:
                        ext = 'webp'
                    elif 'gif' in content_type:
                        ext = 'gif'
                    filename = f'company.{ext}'
                    application.company_image.save(
                        filename,
                        ContentFile(img_resp.content),
                        save=False,
                    )
            except Exception as exc:
                logger.warning('Failed to download og_image %s: %s', og_image, exc)

        # 6. Gather company intel (news, hiring, layoffs, reputation)
        from datetime import date
        _today = date.today()
        _month_year = _today.strftime('%B %Y')
        _this_year = _today.year
        _last_year = _this_year - 1

        intel_queries = [
            ('company_news', f'{company_name} news latest {_month_year}, {_this_year}, {_last_year}'),
            ('hiring_news', f'{company_name} hiring jobs {_month_year}, {_this_year}, {_last_year}'),
            ('layoff_news', f'{company_name} layoffs workforce reduction {_month_year}, {_this_year}, {_last_year}'),
            ('reputation', f'{company_name} employee reviews reputation glassdoor {_this_year}'),
        ]

        company_intel = {}
        for key, query in intel_queries:
            try:
                intel_search = _scraper_post('/search', {'query': query, 'maxResults': 5})
                intel_results = intel_search if isinstance(intel_search, list) else intel_search.get('results', [])
                if intel_results:
                    results_text = "\n".join(
                        f"- Title: {r.get('title', '')} | URL: {r.get('url', '')} | Snippet: {r.get('snippet', '')}"
                        for r in intel_results[:5]
                    )
                    intel_result = chat_structured(
                        messages=[
                            {"role": "system", "content": _INTEL_SYSTEM_PROMPT},
                            {"role": "user", "content": f"COMPANY: {company_name}\n\nSEARCH RESULTS:\n{results_text}"},
                        ],
                        response_model=_CompanyIntelResult,
                        temperature=0.1,
                    )
                    company_intel[key] = [item.model_dump() for item in intel_result.items]
                else:
                    company_intel[key] = []
            except Exception as exc:
                logger.warning('Intel search failed for %s (%s): %s', key, company_name, exc)
                company_intel[key] = []

        # 7. Save and return
        update_fields = ['company_description', 'company_intel', 'modified']
        application.company_description = about_text
        application.company_intel = company_intel
        if og_image and application.company_image:
            update_fields.append('company_image')
        application.save(update_fields=update_fields)
        _invalidate_application(request.user.id, pk)

        serializer = JobApplicationSerializer(application, context={'request': request})
        company_image_url = serializer.data.get('company_image_url')

        return Response({
            'company_description': about_text,
            'company_image_url': company_image_url,
            'company_intel': company_intel,
        })
