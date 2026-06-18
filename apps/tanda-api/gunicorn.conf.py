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
timeout = int(os.environ.get('GUNICORN_TIMEOUT', 120))
loglevel = os.environ.get('GUNICORN_LOG_LEVEL', 'warning')
accesslog = '-'
errorlog = '-'
logger_class = _Logger
