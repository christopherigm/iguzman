import logging
import multiprocessing
import os

from gunicorn.glogging import Logger


class _HealthCheckFilter(logging.Filter):
    def filter(self, record):
        return 'kube-probe' not in record.getMessage()


class _Logger(Logger):
    def setup(self, cfg):
        super().setup(cfg)
        self.access_log.addFilter(_HealthCheckFilter())


bind = '0.0.0.0:8000'
workers = int(os.environ.get('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))

# Threaded workers, for the same reason website-api runs them: `POST /api/ai/chat/`
# streams an LLM completion as SSE and holds its worker for the whole generation
# (tens of seconds). With plain sync workers, two concurrent authoring requests
# would block every other API call - including the public journal feed - until
# they finished. `MAX_VIDEO_UPLOAD_MB`-sized uploads occupy a worker for a long
# time for the same reason.
worker_class = os.environ.get('GUNICORN_WORKER_CLASS', 'gthread')
threads = int(os.environ.get('GUNICORN_THREADS', 4))

timeout = int(os.environ.get('GUNICORN_TIMEOUT', 120))
loglevel = os.environ.get('GUNICORN_LOG_LEVEL', 'warning')
accesslog = '-'
errorlog = '-'
logger_class = _Logger
