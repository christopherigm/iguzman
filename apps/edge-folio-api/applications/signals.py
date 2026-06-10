import logging
import threading

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _compute_metrics(application_id: int, user_id: int) -> None:
    """Compute all three match metrics and persist them. Runs in a background thread."""
    from django.core.cache import cache

    from career.models import Education, WorkExperience
    from matrix.models import BulletPoint, Skill

    from .models import JobApplication
    from .tailoring import (
        calculate_nafta_likelihood,
        calculate_overall_match,
        calculate_technical_match,
    )

    try:
        app = JobApplication.objects.get(pk=application_id)
    except JobApplication.DoesNotExist:
        return

    bullets_qs = list(
        BulletPoint.objects.filter(user_id=user_id, is_approved=True).prefetch_related('skills')
    )
    bullets_payload = [
        {
            'id': b.id,
            'text': b.text,
            'category': b.category,
            'skills': [s.name for s in b.skills.all()],
        }
        for b in bullets_qs
    ]
    skills = list(Skill.objects.filter(user_id=user_id).values('name', 'proficiency'))
    work_experiences = list(
        WorkExperience.objects.filter(user_id=user_id)
        .order_by('-start_date')
        .values('company', 'title', 'start_date', 'end_date', 'is_current', 'location')
    )
    educations = list(
        Education.objects.filter(user_id=user_id)
        .order_by('-start_year')
        .values('institution', 'degree', 'field_of_study', 'start_year', 'end_year')
    )

    try:
        overall, _ = calculate_overall_match(
            job_description=app.job_description,
            job_title=app.job_title,
            company_name=app.company_name,
            bullets=bullets_payload,
            skills=skills,
        )
        technical, _ = calculate_technical_match(
            job_description=app.job_description,
            job_title=app.job_title,
            company_name=app.company_name,
            bullets=bullets_payload,
            skills=skills,
        )
        nafta, _ = calculate_nafta_likelihood(
            job_description=app.job_description,
            job_title=app.job_title,
            skills=skills,
            work_experiences=work_experiences,
            educations=educations,
        )
    except Exception:
        logger.exception('Failed to compute metrics for application %d', application_id)
        return

    JobApplication.objects.filter(pk=application_id).update(
        overall_match=overall,
        technical_match=technical,
        nafta_tn_likelihood=nafta,
    )
    cache.delete(f'applications:applications:{user_id}')
    cache.delete(f'applications:application:{user_id}:{application_id}')
    logger.info(
        'Metrics computed for application %d: overall=%d technical=%d nafta=%d',
        application_id, overall, technical, nafta,
    )


@receiver(post_save, sender='applications.JobApplication')
def trigger_metrics_on_create(sender, instance, created, **kwargs):
    if not created:
        return
    thread = threading.Thread(
        target=_compute_metrics,
        args=(instance.id, instance.user_id),
        daemon=True,
    )
    thread.start()
