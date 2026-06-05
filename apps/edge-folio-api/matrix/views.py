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
