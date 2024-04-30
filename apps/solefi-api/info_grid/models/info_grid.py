from django.db import models
from common.models import CommonFields

# Create your models here.

class InfoGrid(CommonFields):
    name=models.SlugField (
        null=False,
        blank=False,
        max_length=32
    )
    page=models.ForeignKey (
        'pages.Page',
        related_name='page_info_grid',
        null=False,
        blank=False,
        on_delete=models.CASCADE
    )
    title=models.CharField (
        null=True,
        blank=True,
        max_length=64
    )
    sub_title=models.CharField (
        null=True,
        blank=True,
        max_length=64
    )
    items=models.ManyToManyField (
        'info_grid.InfoGridItem',
        related_name='items_of_infoGrid',
        blank=True
    )
    link=models.URLField (
        null=True,
        blank=True
    )
    button_text=models.CharField (
        null=True,
        blank=True,
        max_length=32
    )

    def __str__(self):
        if self.title:
            return self.title
        return self.name

    class JSONAPIMeta:
        resource_name="InfoGrid"
