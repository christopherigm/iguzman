import django.db.models.deletion
from django.db import migrations, models


def migrate_gallery_to_fk(apps, schema_editor):
    SuccessStory = apps.get_model('core', 'SuccessStory')
    for story in SuccessStory.objects.prefetch_related('gallery'):
        for i, img in enumerate(story.gallery.order_by('id')):
            if img.story_id is None:
                img.story = story
                img.sort_order = i
                img.save(update_fields=['story', 'sort_order'])


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_brand_system'),
    ]

    operations = [
        migrations.AddField(
            model_name='successstoryimage',
            name='story',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='images',
                to='core.successstory',
            ),
        ),
        migrations.AddField(
            model_name='successstoryimage',
            name='sort_order',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.RunPython(migrate_gallery_to_fk, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='successstory',
            name='gallery',
        ),
        migrations.AlterModelOptions(
            name='successstoryimage',
            options={'ordering': ['sort_order'], 'verbose_name': 'Success Story Image', 'verbose_name_plural': 'Success Story Images'},
        ),
    ]
