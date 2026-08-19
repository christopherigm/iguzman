"""Gunicorn configuration.

This used to be a list of flags in the Dockerfile's CMD. It became a file when
access logging was turned on, because the access log needs a Python logging
filter and a CMD flag cannot express one.

⚠ Why access logging is on at all: it was off, and that is what made a production
incident un-diagnosable. The API was being restarted by its liveness probe and
there was no per-request timing anywhere - no way to ask "what was slow at
05:47?", only the kubelet's word that something took longer than a second. The
`%(L)s` at the end of the format below is the whole point of this file.
"""

import logging

# ── Server ──────────────────────────────────────────────────────────────────
bind = '0.0.0.0:8000'

# 2 workers is appropriate for a 0.5-CPU container.
#
# Threaded (gthread) rather than sync workers: /api/ai/chat/ streams an LLM
# completion, which holds its worker for the whole generation. With 2 sync workers
# a pair of concurrent enhance requests would block every other API call until they
# finished; threads keep those waits off the request path.
workers = 2
threads = 8
worker_class = 'gthread'

# The 600s timeout matches the ingress's proxy read/send timeouts: a tenant
# backup or restore (/api/backups/) is one synchronous request that zips or
# unpacks the whole media volume, and being killed part-way through is the worst
# possible moment for either. It bounds a genuinely wedged worker, nothing more.
timeout = 600

# ── Logging ─────────────────────────────────────────────────────────────────
accesslog = '-'
errorlog = '-'

# Same as gunicorn's default access format plus **`%(L)s` - the request duration
# in seconds**. Without that trailing number this file would only prove a request
# happened, not that it was the slow one.
access_log_format = '%(h)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %(L)s'

# The kubelet probes /healthz/ every 10s and /readyz/ every 10s, per pod, forever.
# Logged, that is the overwhelming majority of the access log and it buries the
# real traffic this log exists to explain. They are dropped here rather than by
# making the probes quieter, because a probe that does not run is not a probe.
_PROBE_PATHS = ('/healthz/', '/readyz/')


class _SkipProbes(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        return not any(f'GET {path}' in message for path in _PROBE_PATHS)


def post_worker_init(worker):
    """Attach the filter inside each worker, where the access logger really lives."""
    logging.getLogger('gunicorn.access').addFilter(_SkipProbes())
