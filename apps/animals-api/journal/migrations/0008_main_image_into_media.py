"""Retire a sighting's Main Image column: promote it to its first photo.

The journal half of ``catalog.0012_main_image_into_gallery`` - read that one for
why the column is going and how the file is moved without being copied. The only
difference here is the destination: a sighting's photographs are ``SightingMedia``
rows carrying a ``kind``, sharing one ``sort_order`` sequence with its clips, so
the promoted photo is inserted as ``kind='image'`` at 0 and everything else -
photos *and* videos - shifts down one, preserving the order an author arranged.
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
def promote_main_images(apps, schema_editor):
    Sighting = apps.get_model('journal', 'Sighting')
    SightingMedia = apps.get_model('journal', 'SightingMedia')
    for obj in Sighting.objects.exclude(image='').exclude(image=None).iterator():
        SightingMedia.objects.filter(sighting=obj).update(sort_order=F('sort_order') + 1)
        row = SightingMedia.objects.create(sighting=obj, kind='image', sort_order=0)
        SightingMedia.objects.filter(pk=row.pk).update(image=obj.image.name)
        Sighting.objects.filter(pk=obj.pk).update(image=None)


class Migration(migrations.Migration):

    dependencies = [
        ('journal', '0007_regular_plus_images'),
    ]

    operations = [
        migrations.RunPython(promote_main_images, migrations.RunPython.noop),
    ]
