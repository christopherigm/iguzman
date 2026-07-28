from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        # Registers the System cache receiver. Imported here rather than at
        # module level because `signals` imports models.
        from . import signals  # noqa: F401
