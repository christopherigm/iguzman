import logging

from django.core.cache import cache
from groq import GroqError
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from matrix.models import BulletPoint, Skill

from .models import JobApplication
from .serializers import JobApplicationSerializer
from .tailoring import generate_cover_letter, tailor_resume

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

        bullets_payload = [
            {
                'id': b.id,
                'text': b.text,
                'category': b.category,
                'skills': [s.name for s in b.skills.all()],
            }
            for b in approved_bullets
        ]
        skills_payload = list(
            Skill.objects.filter(user=request.user).values('name', 'proficiency')
        )

        try:
            tailored = tailor_resume(
                job_description=application.job_description,
                bullets=bullets_payload,
                skills=skills_payload,
            )
        except GroqError as exc:
            logger.error('Groq API error during tailoring: %s', exc)
            return Response(
                {'detail': 'LLM service unavailable. Please try again later.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (ValueError, KeyError) as exc:
            logger.error('Unexpected LLM response during tailoring: %s', exc)
            return Response(
                {'detail': 'Unexpected response from LLM. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({'bullets': tailored})


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
        except GroqError as exc:
            logger.error('Groq API error during cover letter generation: %s', exc)
            return Response(
                {'detail': 'LLM service unavailable. Please try again later.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except (ValueError, KeyError) as exc:
            logger.error('Unexpected LLM response during cover letter generation: %s', exc)
            return Response(
                {'detail': 'Unexpected response from LLM. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({'cover_letter': cover_letter})
