from rest_framework.viewsets import ReadOnlyModelViewSet
from common.models import HomePicture
from common.serializers import HomePictureSerializer

class HomePictureViewSet(ReadOnlyModelViewSet):
    queryset=HomePicture.objects.all()
    serializer_class=HomePictureSerializer
    filter_fields=("enabled", "system", "position")
    ordering=("order", "id")
