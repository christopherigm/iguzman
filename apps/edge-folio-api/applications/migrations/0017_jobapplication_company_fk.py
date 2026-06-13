import re

import django.db.models.deletion
from django.db import migrations, models


def _normalize(name: str) -> str:
    legal = re.compile(
        r'\b(incorporated|corporation|limited|inc|llc|ltd|corp|co|gmbh|plc|ag|nv|bv|sa|sas|sarl'
        r'|group|holdings|international|enterprises|solutions|technologies|services|systems)\.?\b',
        re.IGNORECASE,
    )
    name = name.lower().strip()
    name = legal.sub('', name)
    name = re.sub(r'[^\w\s]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def migrate_company_data(apps, schema_editor):
    JobApplication = apps.get_model('applications', 'JobApplication')
    Company = apps.get_model('applications', 'Company')

    # Group applications by normalized company name, ordered most-recently-modified first.
    apps_by_norm: dict[str, list] = {}
    for app in JobApplication.objects.all().order_by('-modified'):
        norm = _normalize(app.company_name)
        if not norm:
            continue
        apps_by_norm.setdefault(norm, []).append(app)

    for norm_name, grouped_apps in apps_by_norm.items():
        best = grouped_apps[0]
        has_data = bool(getattr(best, 'company_description', '') or getattr(best, 'company_intel', None))

        company = Company.objects.create(
            name=best.company_name,
            normalized_name=norm_name,
            status='complete' if has_data else 'pending',
            last_refreshed=best.modified if has_data else None,
            description=getattr(best, 'company_description', '') or '',
            intel=getattr(best, 'company_intel', None),
            analysis=getattr(best, 'company_analysis', None),
        )

        for app in grouped_apps:
            app.company_id = company.pk
            app.save(update_fields=['company_id'])


def reverse_migrate(apps, schema_editor):
    JobApplication = apps.get_model('applications', 'JobApplication')
    JobApplication.objects.all().update(company_id=None)
    apps.get_model('applications', 'Company').objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('applications', '0016_company'),
    ]

    operations = [
        # 1. Add nullable FK
        migrations.AddField(
            model_name='jobapplication',
            name='company',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='job_applications',
                to='applications.company',
            ),
        ),
        # 2. Data migration
        migrations.RunPython(migrate_company_data, reverse_code=reverse_migrate),
        # 3. Remove old per-application company fields
        migrations.RemoveField(model_name='jobapplication', name='company_description'),
        migrations.RemoveField(model_name='jobapplication', name='company_intel'),
        migrations.RemoveField(model_name='jobapplication', name='company_analysis'),
        migrations.RemoveField(model_name='jobapplication', name='company_image'),
    ]
