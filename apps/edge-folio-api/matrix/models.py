from django.contrib.auth.models import User
from django.db import models

from core.models import Common

CATEGORY_CHOICES = [
    ('impact', 'Impact'),
    ('technical', 'Technical'),
    ('leadership', 'Leadership'),
    ('collaboration', 'Collaboration'),
    ('other', 'Other'),
]

SOURCE_CHOICES = [
    ('manual', 'Manual'),
    ('extracted', 'Extracted'),
]


class Skill(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='skills')
    name = models.CharField(max_length=100)
    proficiency = models.PositiveSmallIntegerField(default=3)

    class Meta:
        ordering = ['name']
        unique_together = [('user', 'name')]

    def __str__(self):
        return f'{self.name} ({self.user.email})'


class BulletPoint(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bullet_points')
    text = models.CharField(max_length=500)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='impact')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='manual')
    is_approved = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    skills = models.ManyToManyField(Skill, blank=True, related_name='bullet_points')

    class Meta:
        ordering = ['order', 'created']

    def __str__(self):
        preview = self.text[:60]
        suffix = '…' if len(self.text) > 60 else ''
        return f'{preview}{suffix} ({self.user.email})'
