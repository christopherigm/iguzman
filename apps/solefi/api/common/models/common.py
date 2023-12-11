from django.db import models

class CommonFields(models.Model):
    enabled = models.BooleanField (
        blank = False,
        default = True
    )
    created = models.DateTimeField (
        auto_now_add = True,
        null = False
    )
    modified = models.DateTimeField (
        auto_now = True
    )
    version=models.PositiveIntegerField (
        default=1,
        blank=False,
        null=False
    )
    
    def save(self, *args, **kwargs):
        self.version=self.version + 1
        super().save(*args, **kwargs)

    class Meta:
        abstract = True
