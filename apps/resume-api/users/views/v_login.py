import json
from rest_framework import status
from django.contrib.auth import authenticate
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework_simplejwt.views import TokenObtainPairView
# from django.contrib.auth.models import User
from users.models import User
from users.serializers import UserLoginSerializer

@method_decorator(csrf_exempt, name="dispatch")
class Login(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        is_valid = False  
        body_unicode = request.body.decode("utf-8")
        body = json.loads(body_unicode)
        if "email" in body["data"] and "password" in body["data"]:
            user = get_object_or_404(
                User,
                is_active = True,
                email = body["data"]["email"]
            )
        if "username" in body["data"] and "password" in body["data"]:
            user = get_object_or_404(
                User,
                is_active = True,
                username = body["data"]["username"]
            )
        if user:
            is_valid = authenticate(username=user.username, password=body["data"]["password"])
        if not is_valid:
            return Response( data = [{
                "detail": "Wrong credentials",
                "status": 400
            }], status = status.HTTP_400_BAD_REQUEST )
        else:
            user.user_agent = self.request.META.get("HTTP_USER_AGENT")
            user.remote_addr = self.request.META.get("REMOTE_ADDR")
            user = UserLoginSerializer(user, many=False, context={"request": request})
            return Response(user.data)
