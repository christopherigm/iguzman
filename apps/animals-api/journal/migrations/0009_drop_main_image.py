"""Drop the retired ``image`` column from ``Sighting``.

The journal half of ``catalog.0013_drop_main_image`` - read that one for the
reasoning, the reparenting trick and the note on what a pre-0012 backup archive
now restores. ``Sighting`` moves from ``RegularPlusPicture`` to ``BasePicture``;
``SightingMedia`` keeps the picture base, because a media row's ``image`` is the
photograph itself.

As there, any straggler the release could not have caught is promoted first -
inserted as a ``kind='image'`` row at ``sort_order`` 0, with the entry's photos
*and* its clips shifted down one so the order an author arranged survives.
"""

from django.db import migrations
from django.db.models import F


# ⚠ The image name is written with a follow-up `update()`, never passed to
# `create()`. `core.fields.ResizedImageField.pre_save` tests `hasattr(file,
# "file")` to decide whether to resize, and that getter **opens the file from
# storage** - so creating the row with the name attached would download every
# promoted photograph from R2 just to check a flag it was always going to skip,
# and would abort the whole migration on the first row whose file is missing
# (an images-off restore, an object deleted from the bucket). `update()` writes
# the column directly and touches no storage at all.
def promote_stragglers(apps, schema_editor):
    Sighting = apps.get_model('journal', 'Sighting')
    SightingMedia = apps.get_model('journal', 'SightingMedia')
    for obj in Sighting.objects.exclude(image='').exclude(image=None).iterator():
        SightingMedia.objects.filter(sighting=obj).update(sort_order=F('sort_order') + 1)
        row = SightingMedia.objects.create(sighting=obj, kind='image', sort_order=0)
        SightingMedia.objects.filter(pk=row.pk).update(image=obj.image.name)


class Migration(migrations.Migration):

    dependencies = [
        ('journal', '0008_main_image_into_media'),
    ]

    operations = [
        migrations.RunPython(promote_stragglers, migrations.RunPython.noop),
        migrations.RemoveField(model_name='sighting', name='image'),
    ]
