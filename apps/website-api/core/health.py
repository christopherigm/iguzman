"""Container health endpoints.

These exist because the Kubernetes probes used to point at ``/admin/``, and that
turned out to be the reason the API kept "crashing": ``/admin/`` is a real Django
view that redirects to ``/admin/login/`` and touches the session store (Redis, via
``SESSION_ENGINE``) and the database. So a slow *dependency* - not a broken
process - made the liveness probe time out, and the kubelet SIGTERMed a perfectly
healthy pod. The signature was a container exiting 0 with no traceback.

The split below is the whole point, and the two must not be merged:

``/healthz/`` - **liveness**. "Is this process able to serve a request at all?"
    It touches nothing: no database, no cache, no tenant lookup. Django's session
    and auth middleware are lazy, so a view that never reads ``request.session``
    or ``request.user`` never opens a connection to anything. A dependency outage
    must never be able to fail this, because failing liveness *restarts the pod*,
    and restarting Django does not fix Redis.

``/readyz/`` - **readiness**. "Should this pod receive traffic right now?"
    This one *does* check the database and cache, and returns 503 when either is
    unreachable. Failing readiness only removes the pod from the Service's
    endpoints; it recovers by itself the moment the dependency does. This is the
    probe that is allowed to care about Postgres and Redis.
"""

import time

from django.db import connection
from django.core.cache import cache
from django.http import HttpResponse, JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt

# Anything the probe talks to gets a hard ceiling well under the probe's own
# timeout, so a hung dependency reports "not ready" instead of hanging the worker
# thread until gunicorn's 600s timeout reaps it.
_READY_TIMEOUT = 2


@csrf_exempt
@never_cache
def healthz(request):
    """Liveness: the process is up and can serve. Checks nothing else, on purpose."""
    return HttpResponse('ok', content_type='text/plain')


@csrf_exempt
@never_cache
def readyz(request):
    """Readiness: the process can actually reach the things it needs to answer with."""
    checks = {}

    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
        checks['database'] = 'ok'
    except Exception as exc:
        checks['database'] = f'error: {exc.__class__.__name__}'

    try:
        # The value is compared, not just fetched, and that is load-bearing: the
        # cache runs with IGNORE_EXCEPTIONS=True (see settings), so a dead Redis
        # makes these calls return None quietly instead of raising. Only a value
        # that survives the round-trip proves Redis actually answered.
        token = str(time.time())
        cache.set('healthcheck:readyz', token, _READY_TIMEOUT)
        checks['cache'] = 'ok' if cache.get('healthcheck:readyz') == token else 'error: unreachable'
    except Exception as exc:
        checks['cache'] = f'error: {exc.__class__.__name__}'

    healthy = all(value == 'ok' for value in checks.values())
    return JsonResponse(
        {'status': 'ok' if healthy else 'degraded', 'checks': checks},
        status=200 if healthy else 503,
    )
