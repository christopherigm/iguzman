import logging

from django.conf import settings
from pydantic import BaseModel
from django.core.cache import cache
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import BulletPoint, Skill
from .serializers import (
    BulletPointReadSerializer,
    BulletPointWriteSerializer,
    SkillSerializer,
)

logger = logging.getLogger(__name__)

CACHE_TTL = 300  # 5 minutes


def _invalidate_skill(user_id, pk=None):
    cache.delete(f'matrix:skills:{user_id}')
    cache.delete(f'matrix:bullets:{user_id}')  # bullets embed skills via BulletPointReadSerializer
    if pk is not None:
        cache.delete(f'matrix:skill:{user_id}:{pk}')


def _invalidate_bullet(user_id, pk=None):
    cache.delete(f'matrix:bullets:{user_id}')
    if pk is not None:
        cache.delete(f'matrix:bullet:{user_id}:{pk}')


class SkillListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SkillSerializer

    def get_queryset(self):
        return Skill.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        cache_key = f'matrix:skills:{request.user.id}'
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
        _invalidate_skill(request.user.id)
        return response


class SkillDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SkillSerializer

    def get_queryset(self):
        return Skill.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = f'matrix:skill:{request.user.id}:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        _invalidate_skill(request.user.id, kwargs.get('pk'))
        return response

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        response = super().destroy(request, *args, **kwargs)
        _invalidate_skill(request.user.id, pk)
        return response


class BulletPointListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BulletPointWriteSerializer
        return BulletPointReadSerializer

    def get_queryset(self):
        return (
            BulletPoint.objects.filter(user=self.request.user)
            .prefetch_related('skills')
        )

    def list(self, request, *args, **kwargs):
        cache_key = f'matrix:bullets:{request.user.id}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bullet = serializer.save(user=request.user)
        _invalidate_bullet(request.user.id)
        read_serializer = BulletPointReadSerializer(
            bullet, context={'request': request}
        )
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)


class BulletPointDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return BulletPointWriteSerializer
        return BulletPointReadSerializer

    def get_queryset(self):
        return (
            BulletPoint.objects.filter(user=self.request.user)
            .prefetch_related('skills')
        )

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = f'matrix:bullet:{request.user.id}:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        bullet = serializer.save()
        _invalidate_bullet(request.user.id, instance.pk)
        read_serializer = BulletPointReadSerializer(
            bullet, context={'request': request}
        )
        return Response(read_serializer.data)

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        response = super().destroy(request, *args, **kwargs)
        _invalidate_bullet(request.user.id, pk)
        return response


class BulletReorderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        items = request.data
        if not isinstance(items, list):
            return Response(
                {'detail': 'Expected a list of {id, order} objects.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        ids = []
        order_map = {}
        for item in items:
            try:
                bid = int(item['id'])
                order = int(item['order'])
            except (KeyError, TypeError, ValueError):
                return Response(
                    {'detail': 'Each item must have integer "id" and "order".'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            ids.append(bid)
            order_map[bid] = order

        bullets = BulletPoint.objects.filter(user=request.user, id__in=ids)
        for bullet in bullets:
            bullet.order = order_map[bullet.id]
        BulletPoint.objects.bulk_update(bullets, ['order'])
        _invalidate_bullet(request.user.id)

        return Response({'detail': 'Reordered.'})


# ── Skeleton synthesis ────────────────────────────────────────────────────────

class _SkeletonDraft(BaseModel):
    text: str
    category: str
    skills: list[str] = []


class _SkeletonSynthesisResult(BaseModel):
    drafts: list[_SkeletonDraft]


def _synthesize_skeleton_with_llm(skeleton: dict) -> dict:
    from edge_folio_api.llm import chat_structured

    languages = ', '.join(skeleton.get('languages', [])[:20]) or 'none detected'
    frameworks = ', '.join(skeleton.get('frameworks', [])[:20]) or 'none detected'
    runtime_deps = ', '.join(skeleton.get('runtimeDeps', [])[:30]) or 'none'
    dev_deps = ', '.join(skeleton.get('devDeps', [])[:20]) or 'none'
    imported_modules = ', '.join(skeleton.get('importedModules', [])[:30]) or 'none'

    infra = skeleton.get('infra', {})
    infra_parts = []
    if infra.get('hasDocker'):
        infra_parts.append('Docker')
    if infra.get('hasKubernetes'):
        infra_parts.append('Kubernetes')
    infra_parts.extend(infra.get('ciSystems', [])[:5])
    infra_parts.extend(infra.get('cloudHints', [])[:5])
    infra_str = ', '.join(infra_parts) or 'none detected'

    kicad = skeleton.get('kicadFiles', [])
    kicad_str = f'{len(kicad)} KiCad project file(s)' if kicad else 'none'

    file_stats = skeleton.get('fileStats', {})
    total_files = file_stats.get('totalFiles', 0)
    code_files = file_stats.get('codeFiles', 0)
    project_name = skeleton.get('projectName', 'Unknown')

    prompt = (
        'You are a senior technical resume writer. Given a codebase structure summary '
        '(no source code, no proprietary data), generate professional resume bullet points '
        'a software engineer could use on their CV.\n\n'
        'Rules:\n'
        '- Each bullet: one factual, achievement-oriented sentence under 500 chars. Use STAR format where possible.\n'
        '- Infer plausible achievements from the tech stack without inventing metrics or team sizes.\n'
        '- category: impact=business/product outcome, technical=engineering depth, '
        'leadership=ownership/architecture, collaboration=cross-team, other=else\n'
        '- skills: only languages, frameworks, and tools clearly visible in this project\n'
        '- Generate 5-12 bullets depending on the richness of the structure\n\n'
        f'Project: "{project_name}"\n'
        f'Files: {code_files} code / {total_files} total\n'
        f'Languages: {languages}\n'
        f'Frameworks: {frameworks}\n'
        f'Runtime deps: {runtime_deps}\n'
        f'Dev deps: {dev_deps}\n'
        f'Imports: {imported_modules}\n'
        f'Infrastructure: {infra_str}\n'
        f'Hardware design: {kicad_str}\n'
    )

    result = chat_structured(
        messages=[{'role': 'user', 'content': prompt}],
        response_model=_SkeletonSynthesisResult,
        temperature=0.2,
    )
    return result.model_dump()


class SkeletonSynthesisView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        skeleton = request.data
        if not isinstance(skeleton, dict):
            return Response(
                {'detail': 'Expected a Skeleton JSON object.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not settings.GROQ_API_KEY:
            return Response(
                {'detail': 'AI synthesis is not configured on this server.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            result = _synthesize_skeleton_with_llm(skeleton)
        except Exception as exc:
            logger.warning('Skeleton synthesis failed: %s', exc)
            return Response(
                {'detail': 'AI analysis failed. Please try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        valid_categories = {'impact', 'technical', 'leadership', 'collaboration', 'other'}
        drafts = []
        for item in result.get('drafts', [])[:15]:
            if not isinstance(item, dict):
                continue
            text = str(item.get('text', '')).strip()
            if not text or len(text) > 500:
                continue
            category = item.get('category', 'technical')
            if category not in valid_categories:
                category = 'technical'
            raw_skills = item.get('skills', [])
            skills = [
                s.strip()[:100]
                for s in raw_skills
                if isinstance(s, str) and s.strip()
            ][:10]
            drafts.append({'text': text, 'category': category, 'skills': skills})

        return Response({'drafts': drafts})
