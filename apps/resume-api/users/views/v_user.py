from rest_framework.viewsets import ModelViewSet
from django.http import Http404
from rest_framework.response import Response
from users.models import User
from common.permissions import IsAdminOrIsItSelf
from users.serializers import UserSerializer
from rest_framework.permissions import IsAuthenticatedOrReadOnly, IsAdminUser

class UserViewSet(ModelViewSet):
    """
    User instance
    """
    queryset = User.objects.filter(
        is_active=True,
        public=True,
        published=True,
        listed=True
    )
    serializer_class = UserSerializer
    ordering = ["id"]
    ordering_fields = [
        "id", "first_name", "last_name", "last_login"
    ]
    filterset_fields = {
        "id": ("exact",),
        "is_superuser": ("exact",),
        "username": ("exact", "in"),
        "email": ("exact", "in"),
        "last_login": ("exact", "lt", "gt", "gte", "lte", "in"),
        "date_joined": ("exact", "lt", "gt", "gte", "lte", "in")
    }
    search_fields = [
        "first_name", "last_name", "email", "username"
    ]

    def list(self, request):
        username = request.GET.get("filter[user.username]")
        is_authenticated = request.user.is_authenticated
        if username is not None:
            queryset = self.filter_queryset(User.objects.filter(
                is_active=True,
                public=True,
                published=True
            ))
        else:
            queryset = self.filter_queryset(self.get_queryset())
        if is_authenticated and request.user.is_staff:
            queryset = self.filter_queryset(User.objects.all())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, pk=None):
        self.queryset = User.objects.all()
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        if request.user.is_authenticated and request.user.id == instance.id or request.user.is_staff:
            return Response(serializer.data)
        elif instance.public is False or instance.published is False or instance.listed is False:
            raise Http404
        return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, '_prefetched_objects_cache', None):
            # If 'prefetch_related' has been applied to a queryset, we need to
            # forcibly invalidate the prefetch cache on the instance.
            instance._prefetched_objects_cache = {}

        return Response(serializer.data)

    def perform_update(self, serializer):
        serializer.save()

    def partial_update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def get_permissions(self):
        permission_classes = [IsAuthenticatedOrReadOnly]
        if self.action in ("update", "destroy"):
            permission_classes = [IsAdminOrIsItSelf]
        if self.action in ("list", "create"):
            permission_classes = []
        return [permission() for permission in permission_classes]
