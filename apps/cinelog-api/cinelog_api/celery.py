import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cinelog_api.settings')

app = Celery('cinelog_api')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
