from django.core.cache import cache
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from .models import Education, WorkExperience
from .serializers import EducationSerializer, WorkExperienceSerializer

CACHE_TTL = 300  # 5 minutes


def _invalidate_work_experience(user_id, pk=None):
    cache.delete(f'career:work_experiences:{user_id}')
    if pk is not None:
        cache.delete(f'career:work_experience:{user_id}:{pk}')


def _invalidate_education(user_id, pk=None):
    cache.delete(f'career:educations:{user_id}')
    if pk is not None:
        cache.delete(f'career:education:{user_id}:{pk}')


class WorkExperienceListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkExperienceSerializer

    def get_queryset(self):
        return WorkExperience.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        cache_key = f'career:work_experiences:{request.user.id}'
        cached = cache.get(cache_key)
        if cached is not None:
            from rest_framework.response import Response
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        _invalidate_work_experience(request.user.id)
        return response


class WorkExperienceDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = WorkExperienceSerializer

    def get_queryset(self):
        return WorkExperience.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = f'career:work_experience:{request.user.id}:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            from rest_framework.response import Response
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        _invalidate_work_experience(request.user.id, kwargs.get('pk'))
        return response

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        response = super().destroy(request, *args, **kwargs)
        _invalidate_work_experience(request.user.id, pk)
        return response


class EducationListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EducationSerializer

    def get_queryset(self):
        return Education.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        cache_key = f'career:educations:{request.user.id}'
        cached = cache.get(cache_key)
        if cached is not None:
            from rest_framework.response import Response
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        response = super().create(request, *args, **kwargs)
        _invalidate_education(request.user.id)
        return response


class EducationDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = EducationSerializer

    def get_queryset(self):
        return Education.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = f'career:education:{request.user.id}:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            from rest_framework.response import Response
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        _invalidate_education(request.user.id, kwargs.get('pk'))
        return response

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        response = super().destroy(request, *args, **kwargs)
        _invalidate_education(request.user.id, pk)
        return response
