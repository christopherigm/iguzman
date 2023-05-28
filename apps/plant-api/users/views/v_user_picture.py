from rest_framework.viewsets import ReadOnlyModelViewSet
from users.models import UserPicture
from users.serializers import UserPictureSerializer

class UserPictureViewSet(ReadOnlyModelViewSet):
    queryset = UserPicture.objects.all()
    serializer_class = UserPictureSerializer
    ordering = ["id"]
    filterset_fields = {
        "id": ("exact",),
        "user": ("exact",),
        "user__username": ("exact",)
    }
