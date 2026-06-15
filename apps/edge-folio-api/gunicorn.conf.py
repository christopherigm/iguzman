import logging
import multiprocessing

bind = '0.0.0.0:8000'
workers = int(__import__('os').environ.get('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))
timeout = int(__import__('os').environ.get('GUNICORN_TIMEOUT', 300))
loglevel = __import__('os').environ.get('GUNICORN_LOG_LEVEL', 'warning')
accesslog = '-'
errorlog = '-'


class _AccessNoiseFilter(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        if 'kube-probe' in message:
            return False
        if '/static/' in message:
            return False
        return True


def on_starting(server):
    logging.getLogger('gunicorn.access').addFilter(_AccessNoiseFilter())
