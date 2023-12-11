import jwt
from django.conf import settings
from django.contrib.auth.models import User
from rest_framework.permissions import BasePermission

class IsAdminOrIsItSelf(BasePermission):
    def has_object_permission(self, request, view, obj):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split(' ')[1]
        if token:
            user = jwt.decode(token, settings.SECRET_KEY, do_time_check=True)
            return ((obj.id == user['user_id']) or user['admin'])
        return (
            (obj==request.user) or (request.user.is_superuser)
        )

class IsSuperUser(BasePermission):
  def has_permission(self, request, view):
    token = None
    if 'Authorization' in request.headers:
        token = request.headers['Authorization'].split(' ')[1]
    if token:
        user = jwt.decode(token, settings.SECRET_KEY, do_time_check=True)
        return user['admin']
    return request.user.is_superuser


class IsAdminOrBelongsToItSelf(BasePermission):
  def has_object_permission(self, request, view, obj):
    user = request.user
    token = None
    if 'Authorization' in request.headers:
        token = request.headers['Authorization'].split(' ')[1]
    if token:
        decoded = jwt.decode(token, settings.SECRET_KEY, do_time_check=True)
        user = User.objects.get(id=decoded['user_id'])
    return (
        obj.user == user or user.is_superuser
    )
