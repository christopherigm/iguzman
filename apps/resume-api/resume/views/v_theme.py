from resume.models import Theme
from resume.serializers import ThemeSerializer
from rest_framework.viewsets import ReadOnlyModelViewSet

class ThemeViewSet(ReadOnlyModelViewSet):
    queryset=Theme.objects.all()
    serializer_class=ThemeSerializer
    ordering=["id"]
