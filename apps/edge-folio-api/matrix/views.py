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


class SkillListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SkillSerializer

    def get_queryset(self):
        return Skill.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SkillDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = SkillSerializer

    def get_queryset(self):
        return Skill.objects.filter(user=self.request.user)


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

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bullet = serializer.save(user=request.user)
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

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        bullet = serializer.save()
        read_serializer = BulletPointReadSerializer(
            bullet, context={'request': request}
        )
        return Response(read_serializer.data)


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

        return Response({'detail': 'Reordered.'})
