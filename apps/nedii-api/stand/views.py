from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
import json
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from rest_framework.viewsets import (
    ModelViewSet,
    GenericViewSet,
)
from rest_framework import mixins
from common.mixins import (
    CustomCreate,
    CustomUpdate
)
from stand.models import (
    Expo,
    Group,
    StandPhone,
    StandRating,
    StandPicture,
    SurveyQuestion,
    VideoLink,
    StandBookingQuestion,
    StandBookingQuestionOption,
    StandNew,
    StandPicture,
    StandPromotion,
    Stand
)
from stand.serializers import (
    ExpoSerializer,
    GroupSerializer,
    StandPhoneSerializer,
    StandRatingSerializer,
    StandPictureSerializer,
    SurveyQuestionSerializer,
    VideoLinkSerializer,
    StandBookingQuestionSerializer,
    StandBookingQuestionOptionSerializer,
    StandNewSerializer,
    StandPictureSerializer,
    StandPromotionSerializer,
    StandSerializer
)
from users.models import User


class ExpoViewSet(ModelViewSet):
    queryset=Expo.objects.all()
    serializer_class=ExpoSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "is_real": ("exact",),
        "slug": ("exact",),
    }
    search_fields=('name',)
    ordering=( 'id', )


class StandGroupViewSet(ModelViewSet):
    queryset=Group.objects.all()
    serializer_class=GroupSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "slug": ("exact",),
    }
    search_fields=('name', 'description')
    ordering=( 'id', )


class StandBookingQuestionViewSet(ModelViewSet):
    queryset=StandBookingQuestion.objects.all()
    serializer_class=StandBookingQuestionSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
    }
    search_fields=('name',)
    ordering=( 'id', )
    # http_method_names=['get']

class StandBookingQuestionOptionsViewSet(ModelViewSet):
    queryset=StandBookingQuestionOption.objects.all()
    serializer_class=StandBookingQuestionOptionSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
    }
    search_fields=('value',)
    ordering=( 'id', )


class StandNewsViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        GenericViewSet
    ):
    queryset=StandNew.objects.all()
    serializer_class=StandNewSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "stand": ("exact",),
        "slug": ("exact",),
    }
    search_fields=('name', 'description')
    ordering=( 'id', )


class StandPhonesViewSet(ModelViewSet):
    queryset=StandPhone.objects.all()
    serializer_class=StandPhoneSerializer
    filter_fields=('enabled',)
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "stand": ("exact",),
    }
    search_fields=('enabled', 'stand', )
    ordering=( 'id', )


class StandPicturesViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        GenericViewSet
    ):
    queryset=StandPicture.objects.all()
    serializer_class=StandPictureSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "stand": ("exact",),
    }
    search_fields=('name', 'description')
    ordering=( 'id', )


class StandPromotionsViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        GenericViewSet
    ):
    queryset=StandPromotion.objects.all()
    serializer_class=StandPromotionSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "stand": ("exact",),
    }
    search_fields=('name', 'description')
    ordering=( 'id', )


class StandRatingViewSet(ModelViewSet):
    queryset=StandRating.objects.all()
    serializer_class=StandRatingSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "stand": ("exact",),
        "author": ("exact",),
    }
    ordering=( 'id', )


class PostRating(APIView):
    permission_classes=[ IsAuthenticated ]
    authentication_classes=[
        JWTAuthentication,
        SessionAuthentication
    ]

    def post(self, request, *args, **kwargs):
        body_unicode=request.body.decode('utf-8')
        body=json.loads(body_unicode)
        common_error={
            'message': 'Missing fields'
        }
        if not 'attributes' in body['data']:
            return Response(common_error, status=400)
        if not 'rating' in body['data']['attributes']:
            return Response(common_error, status=400)
        if not 'relationships' in body['data']:
            return Response(common_error, status=400)
        if not 'stand' in body['data']['relationships']:
            return Response(common_error, status=400)
        if not 'data' in body['data']['relationships']['stand']:
            return Response(common_error, status=400)
        if not 'id' in body['data']['relationships']['stand']['data']:
            return Response(common_error, status=400)
        rating=body['data']['attributes']['rating']
        stand_id=body['data']['relationships']['stand']['data']['id']
        comments=None
        if 'comments' in body['data']['attributes']:
            comments=body['data']['attributes']['comments']
        user=get_object_or_404(
            User,
            id=request.user.id
        )
        stand=get_object_or_404(
            Stand,
            id=stand_id
        )
        ratings=StandRating.objects.filter(
            stand=stand_id,
            author=user.id
        )
        ratings_length=len(ratings)
        if len(ratings) == 0:
            ratings=StandRating(
                stand=stand,
                author=user,
                rating=rating,
                description=comments
            )
            ratings.save()
        else:
            ratings[0].rating=rating
            if comments is not None:
                ratings[0].description=comments
            ratings[0].save()

        # Save new average rating
        count=0
        ratings=StandRating.objects.filter(stand=stand_id)
        for i in ratings:
            count += i.rating
        average=count / len(ratings)
        stand.average_rating=average
        stand.save()

        return Response({
            'success': True,
            'attributes': {
                'user': user.id,
                'stand': stand_id,
                'comments': comments,
                'rating': rating,
                'average_rating': average,
                'ratings_length': ratings_length
            }
        })


class SurveyQuestionsViewSet(ModelViewSet):
    queryset=SurveyQuestion.objects.all()
    serializer_class=SurveyQuestionSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
    }
    search_fields=('name',)
    ordering=( 'id', )


class VideoLinkViewSet(ModelViewSet):
    queryset=VideoLink.objects.all()
    serializer_class=VideoLinkSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "stand": ("exact",),
    }
    search_fields=('name',)
    ordering=( 'id', )

class StandViewSet(CustomCreate,
        CustomUpdate,
        mixins.ListModelMixin,
        mixins.RetrieveModelMixin,
        mixins.DestroyModelMixin,
        GenericViewSet
    ):
    queryset=Stand.objects.all()
    serializer_class=StandSerializer
    filterset_fields = {
        "id": ("exact",),
        "enabled": ("exact",),
        "created": ("exact", "lt", "gt", "gte", "lte", "in"),
        "owner": ("exact", "in",),
        "slug": ("exact",),
        "expo": ("exact", "lt", "gt", "gte", "lte", "in"),
        "group": ("exact", "lt", "gt", "gte", "lte", "in"),
        "plan": ("exact", "lt", "gt", "gte", "lte", "in"),
        "plan__unlimited_items": ("exact",),
        "plan__stand_enabled": ("exact",),
        "plan__digital_card": ("exact",),
        "plan__billed_monthly": ("exact",),
        "expo__slug": ("exact",),
        "group__slug": ("exact",),
        "city": ("exact", "lt", "gt", "gte", "lte", "in"),
        "restaurant": ("exact",),
        "always_open": ("exact",),
        "booking_active": ("exact",),
        "monday_open": ("exact", "lt", "gt", "gte", "lte", "in"),
        "monday_close": ("exact", "lt", "gt", "gte", "lte", "in"),
        "tuesday_open": ("exact", "lt", "gt", "gte", "lte", "in"),
        "tuesday_close": ("exact", "lt", "gt", "gte", "lte", "in"),
        "wednesday_open": ("exact", "lt", "gt", "gte", "lte", "in"),
        "wednesday_close": ("exact", "lt", "gt", "gte", "lte", "in"),
        "thursday_open": ("exact", "lt", "gt", "gte", "lte", "in"),
        "thursday_close": ("exact", "lt", "gt", "gte", "lte", "in"),
        "friday_open": ("exact", "lt", "gt", "gte", "lte", "in"),
        "friday_close": ("exact", "lt", "gt", "gte", "lte", "in"),
        "saturday_open": ("exact", "lt", "gt", "gte", "lte", "in"),
        "saturday_close": ("exact", "lt", "gt", "gte", "lte", "in"),
        "sunday_open": ("exact", "lt", "gt", "gte", "lte", "in"),
        "sunday_close": ("exact", "lt", "gt", "gte", "lte", "in"),
    }
    search_fields=(
        'name', 'bar_code', 'slogan','description',
        'short_description', 'about'
    )
    ordering=( 'id', )
