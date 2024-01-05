import jwt
from django.conf import settings
from rest_framework import mixins
from rest_framework import status
from rest_framework.response import Response
from common import tools

class CustomCreate(mixins.CreateModelMixin):
  def create(self, request, *args, **kwargs):
    userId = request.user.id
    token = None
    if 'Authorization' in request.headers:
        token = self.request.headers['Authorization'].split(' ')[1]
    if token:
        user = jwt.decode(token, settings.SECRET_KEY, do_time_check=True)
        userId = user['user_id']
    request.data.__setitem__('user', {
        'type': 'User',
        'id': userId
    })
    request = tools.save_base64_picture(request)
    serializer = self.get_serializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    self.perform_create(serializer)
    headers = self.get_success_headers(serializer.data)
    return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

class CustomUpdate(mixins.UpdateModelMixin):
  def update(self, request, *args, **kwargs):
    partial = kwargs.pop('partial', False)
    instance = self.get_object()
    if 'user' in request.data:
        del request.data['user']
    request = tools.save_base64_picture(request)
    serializer = self.get_serializer(instance, data=request.data, partial=partial)
    serializer.is_valid(raise_exception=True)
    self.perform_update(serializer)

    if getattr(instance, '_prefetched_objects_cache', None):
      # If 'prefetch_related' has been applied to a queryset, we need to
      # forcibly invalidate the prefetch cache on the instance.
      instance._prefetched_objects_cache = {}

    return Response(serializer.data)

class CountRetrieve(mixins.RetrieveModelMixin):
  def retrieve(self, request, *args, **kwargs):
    instance = self.get_object()
    serializer = self.get_serializer(instance)
    if 'views' in serializer.data:
        views = instance.views
        views += 1
        serializer = self.get_serializer(
            instance,
            data = {
                'views': views 
            },
            partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(serializer.data)
