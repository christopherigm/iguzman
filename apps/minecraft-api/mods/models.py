from django.contrib.auth import get_user_model
from django.db import models

from core.models import Common

User = get_user_model()


def jar_upload_path(instance, filename):
    return f"mods/{instance.mod_id}/{filename}"


class ModStatus(models.TextChoices):
    PENDING = 'pending', 'Pending'
    GENERATING = 'generating', 'Generating Code'
    COMPILING = 'compiling', 'Compiling'
    READY = 'ready', 'Ready'
    FAILED = 'failed', 'Failed'


class Mod(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='mods')

    # ─── Input ───────────────────────────────────────────────────────────────
    prompt = models.TextField()
    llm_model = models.CharField(max_length=100, default='llama-3.3-70b-versatile')

    # ─── LLM-generated metadata ───────────────────────────────────────────────
    mod_id = models.SlugField(max_length=64, blank=True)
    mod_name = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    main_class = models.CharField(max_length=255, blank=True)
    generated_sources = models.JSONField(default=list, blank=True)

    # ─── Build state ─────────────────────────────────────────────────────────
    status = models.CharField(
        max_length=20,
        choices=ModStatus.choices,
        default=ModStatus.PENDING,
        db_index=True,
    )
    build_log = models.TextField(blank=True)
    error = models.TextField(blank=True)

    # ─── Compiled artifacts ───────────────────────────────────────────────────
    fabric_jar = models.FileField(upload_to=jar_upload_path, null=True, blank=True)
    neoforge_jar = models.FileField(upload_to=jar_upload_path, null=True, blank=True)

    class Meta:
        ordering = ['-created']
        verbose_name = 'Mod'
        verbose_name_plural = 'Mods'

    def __str__(self):
        label = self.mod_name or self.prompt[:50]
        return f"{label} [{self.status}]"
