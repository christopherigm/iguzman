import multiprocessing

bind = '0.0.0.0:8000'
workers = int(__import__('os').environ.get('GUNICORN_WORKERS', multiprocessing.cpu_count() * 2 + 1))
timeout = int(__import__('os').environ.get('GUNICORN_TIMEOUT', 120))
loglevel = __import__('os').environ.get('GUNICORN_LOG_LEVEL', 'warning')
accesslog = '-'
errorlog = '-'
