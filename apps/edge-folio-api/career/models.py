from django.contrib.auth.models import User
from django.db import models

from core.models import Common

EMPLOYMENT_TYPE_CHOICES = [
    ('full_time', 'Full-time'),
    ('part_time', 'Part-time'),
    ('contract', 'Contract'),
    ('freelance', 'Freelance'),
    ('internship', 'Internship'),
]

DEGREE_CHOICES = [
    ('bachelor', "Bachelor's"),
    ('master', "Master's"),
    ('phd', 'PhD / Doctorate'),
    ('associate', 'Associate'),
    ('certificate', 'Certificate'),
    ('bootcamp', 'Bootcamp'),
    ('other', 'Other'),
]


class WorkExperience(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='work_experiences')
    company = models.CharField(max_length=200)
    title = models.CharField(max_length=200)
    employment_type = models.CharField(
        max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='full_time'
    )
    location = models.CharField(max_length=200, blank=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return f'{self.title} at {self.company} ({self.user.email})'


class Education(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='educations')
    institution = models.CharField(max_length=200)
    degree = models.CharField(max_length=20, choices=DEGREE_CHOICES, default='bachelor')
    field_of_study = models.CharField(max_length=200, blank=True)
    start_year = models.PositiveSmallIntegerField()
    end_year = models.PositiveSmallIntegerField(null=True, blank=True)
    is_current = models.BooleanField(default=False)
    gpa = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    honors = models.CharField(max_length=100, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        ordering = ['-start_year']

    def __str__(self):
        return f'{self.degree} at {self.institution} ({self.user.email})'


LANGUAGE_PROFICIENCY_CHOICES = [
    ('native', 'Native'),
    ('fluent', 'Fluent'),
    ('professional', 'Professional proficiency'),
    ('basic', 'Basic'),
]


class Language(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='languages')
    name = models.CharField(max_length=100)
    proficiency = models.CharField(max_length=20, choices=LANGUAGE_PROFICIENCY_CHOICES, default='professional')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'name']
        unique_together = [('user', 'name')]

    def __str__(self):
        return f'{self.name} ({self.proficiency}) — {self.user.email}'


class TechStack(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Project(Common):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='projects')
    name = models.CharField(max_length=200)
    url = models.URLField(max_length=300, blank=True, default='')
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=0)
    tech_stack = models.ManyToManyField(TechStack, blank=True, related_name='projects')

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return f'{self.name} ({self.user.email})'
