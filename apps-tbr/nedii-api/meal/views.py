from rest_framework import viewsets, mixins
from common.mixins import (
    CustomCreate,
    CustomUpdate
)
from meal.models import (
    MealAddon,
    MealClassification,
    MealPicture,
    Meal,
)
from meal.serializers import (
    MealAddonSerializer,
    MealClassificationSerializer,
    MealPictureSerializer,
    MealSerializer,
)

class MealAddonViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=MealAddon.objects.all()
    serializer_class=MealAddonSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'stand': ('exact', 'lt', 'gt', 'gte', 'lte'),
    }
    search_fields=("name",)
    ordering=( "id", )


class MealClassificationViewSet( CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=MealClassification.objects.all()
    serializer_class=MealClassificationSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'stand': ('exact', 'lt', 'gt', 'gte', 'lte'),
    }
    search_fields=("name",)
    ordering=( "id", )


class MealPictureViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=MealPicture.objects.all()
    serializer_class=MealPictureSerializer
    filterset_fields={
        'enabled': ('exact',),
        'id': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'created': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'modified': ('exact', 'lt', 'gt', 'gte', 'lte', 'in'),
        'stand': ('exact', 'lt', 'gt', 'gte', 'lte'),
        'meal': ('exact', 'lt', 'gt', 'gte', 'lte'),
    }
    search_fields=("name",)
    ordering=( "id", )

class MealViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        viewsets.GenericViewSet
    ):
    queryset=Meal.objects.all()
    serializer_class=MealSerializer
    filterset_fields={
        "enabled": ("exact",),
        "stand": ("exact",),
        "stand__slug": ("exact",),
        "stand__owner": ("exact",),
        "classification": ("exact", "lt", "gt", "gte", "lte", "in"),
        "meal_addons": ("exact",),
        "slug": ("exact",),
        "created": ("exact", "lt", "gt", "gte", "lte", "in"),
        "modified": ("exact", "lt", "gt", "gte", "lte", "in"),
        "publish_on_the_wall": ("exact",),
        "discount": ("exact", "lt", "gt", "gte", "lte", "in"),
        "is_breakfast": ("exact",),
        "is_meal": ("exact",),
        "is_dinner": ("exact",),
    }
    search_fields=("name",)
    ordering=( "id", )
