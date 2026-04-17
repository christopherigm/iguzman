from django.http import HttpResponse


class HealthCheckMiddleware:
    """Respond to /healthz/ before Django's SecurityMiddleware checks ALLOWED_HOSTS.

    Kubelet probes use the pod IP as the Host header, which is not in
    ALLOWED_HOSTS and would cause a 400.  This middleware must be listed
    *first* in MIDDLEWARE so it runs before SecurityMiddleware.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == '/healthz/':
            return HttpResponse('ok', content_type='text/plain')
        return self.get_response(request)
