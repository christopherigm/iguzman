from resume.models import UserJobPromotion
from resume.serializers import UserJobPromotionSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class UserJobPromotionViewSet(ReadOnlyModelViewSet):
    queryset=UserJobPromotion.objects.all()
    serializer_class=UserJobPromotionSerializer
    filterset_fields={
        'user': ('exact',),
        "user__username": ("exact",),
        'user_job': ('exact',)
    }
    ordering=["id"]
