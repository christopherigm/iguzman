from django.core.cache import cache
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Education, Language, Project, TechStack, WorkExperience
from .serializers import EducationSerializer, LanguageSerializer, ProjectSerializer, TechStackSerializer, WorkExperienceSerializer

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


def _invalidate_language(user_id, pk=None):
    cache.delete(f'career:languages:{user_id}')
    if pk is not None:
        cache.delete(f'career:language:{user_id}:{pk}')


def _invalidate_project(user_id, pk=None):
    cache.delete(f'career:projects:{user_id}')
    if pk is not None:
        cache.delete(f'career:project:{user_id}:{pk}')


class LanguageListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LanguageSerializer

    def get_queryset(self):
        return Language.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        cache_key = f'career:languages:{request.user.id}'
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
        _invalidate_language(request.user.id)
        return response


class LanguageDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = LanguageSerializer

    def get_queryset(self):
        return Language.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = f'career:language:{request.user.id}:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            from rest_framework.response import Response
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        _invalidate_language(request.user.id, kwargs.get('pk'))
        return response

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        response = super().destroy(request, *args, **kwargs)
        _invalidate_language(request.user.id, pk)
        return response


class ProjectListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ProjectSerializer

    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)

    def list(self, request, *args, **kwargs):
        cache_key = f'career:projects:{request.user.id}'
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
        _invalidate_project(request.user.id)
        return response


class ProjectDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ProjectSerializer

    def get_queryset(self):
        return Project.objects.filter(user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = f'career:project:{request.user.id}:{pk}'
        cached = cache.get(cache_key)
        if cached is not None:
            from rest_framework.response import Response
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        _invalidate_project(request.user.id, kwargs.get('pk'))
        return response

    def destroy(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        response = super().destroy(request, *args, **kwargs)
        _invalidate_project(request.user.id, pk)
        return response


class TechStackListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TechStackSerializer
    queryset = TechStack.objects.all()

    def list(self, request, *args, **kwargs):
        cache_key = 'career:tech_stacks'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response

    def create(self, request, *args, **kwargs):
        name = str(request.data.get('name', '')).strip()
        if not name:
            return Response({'name': ['This field is required.']}, status=400)
        tech_stack, created = TechStack.objects.get_or_create(name=name)
        cache.delete('career:tech_stacks')
        cache.delete('career:tech_stacks_popular')
        serializer = self.get_serializer(tech_stack)
        return Response(serializer.data, status=201 if created else 200)


class TechStackPopularView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = TechStackSerializer

    def get_queryset(self):
        from django.db.models import Count
        return (
            TechStack.objects
            .annotate(project_count=Count('projects', distinct=True))
            .annotate(profile_count=Count('user_profiles', distinct=True))
            .order_by('-project_count', '-profile_count', 'name')[:50]
        )

    def list(self, request, *args, **kwargs):
        cache_key = 'career:tech_stacks_popular'
        cached = cache.get(cache_key)
        if cached is not None:
            return Response(cached)
        response = super().list(request, *args, **kwargs)
        cache.set(cache_key, response.data, CACHE_TTL)
        return response
