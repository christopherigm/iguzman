from rest_framework import status
from rest_framework.response import Response
from django.conf import settings
from rest_framework.views import APIView

class SimpleMiddleware:
    def __init__(self):
        self.foo = 'bar'

    def doSomething(self, someValue):
        return someValue + 1


class System( APIView ):
    foo = ''

    def get( self, request ):
        number = SimpleMiddleware.doSomething( self, 0 )
        data = {
            'system': {
                'env': settings.ENVIRONMENT,
                'worker': settings.WORKER,
                'number': str(number) + self.foo
            }
        }
        return Response(data, status.HTTP_200_OK)
