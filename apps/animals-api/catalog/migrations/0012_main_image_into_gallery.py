"""Retire the Main Image column: promote it to the first gallery photo.

Every catalog record's cover used to be resolvable two ways - its own ``image``
column, which the CMS's "Main Image" uploader wrote and which
``core.serializers.gallery_image_url`` honours *first*, else its first gallery
row. Authors found the two-places rule confusing (which box is the cover? why
does re-ordering the photos do nothing?), so the uploader is gone and the rule
is now the single one it started as: **the first photo is the cover**.

This moves the records that had already used it. For each row with a non-empty
``image``: every existing gallery row is pushed down one, the column's file is
inserted as ``sort_order=0``, and the column is cleared. The cover a person
chose therefore stays the cover, and is now an ordinary photo they can re-order
or delete from the CMS like any other.

Two notes on the mechanics:

- **The file is not copied, only re-pointed.** The new gallery row is given the
  parent's stored path verbatim, and the column is emptied afterwards. This
  project has no ``django-cleanup``, so clearing a ``FileField`` never unlinks
  the file - the single remaining reference keeps working, and the migration
  makes no storage calls at all (which matters: in production the files are on
  R2, and a migration that had to read and rewrite each one could fail halfway).
  The only trace is cosmetic: ``core.models.picture`` embeds the model name in
  the path, so a promoted file stays at ``pictures/category/<uuid>.jpg`` while
  its row is now a ``CategoryImage``.
- **The name is written by ``update()``, not by ``create()``**, so the image
  field's ``pre_save`` never runs on it - see the comment on the function below,
  which is what keeps the "no storage calls" claim above true and what stops a
  row whose file has gone missing from aborting the whole run.

Irreversible in practice, hence the no-op backwards path: once the photo is a
gallery row among others, nothing records which one it used to be. The state it
leaves behind is a correct one under the new rule, not a half-migration.
"""

from django.db import migrations
from django.db.models import F

# parent model -> (child model, the child's FK field)
GALLERIES = [
    ('Category', 'CategoryImage', 'category'),
    ('Species', 'SpeciesImage', 'species'),
    ('Season', 'SeasonImage', 'season'),
    ('WeatherCondition', 'WeatherConditionImage', 'weather_condition'),
    ('Location', 'LocationImage', 'location'),
]


# ⚠ The image name is written with a follow-up `update()`, never passed to
# `create()`. `core.fields.ResizedImageField.pre_save` tests `hasattr(file,
# "file")` to decide whether to resize, and that getter **opens the file from
# storage** - so creating the row with the name attached would download every
# promoted photograph from R2 just to check a flag it was always going to skip,
# and would abort the whole migration on the first row whose file is missing
# (an images-off restore, an object deleted from the bucket). `update()` writes
# the column directly and touches no storage at all.
def promote_main_images(apps, schema_editor):
    for parent_name, child_name, fk in GALLERIES:
        Parent = apps.get_model('catalog', parent_name)
        Child = apps.get_model('catalog', child_name)
        for obj in Parent.objects.exclude(image='').exclude(image=None).iterator():
            Child.objects.filter(**{fk: obj}).update(sort_order=F('sort_order') + 1)
            row = Child.objects.create(**{fk: obj}, sort_order=0)
            Child.objects.filter(pk=row.pk).update(image=obj.image.name)
            Parent.objects.filter(pk=obj.pk).update(image=None)


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0011_regular_plus_images'),
    ]

    operations = [
        migrations.RunPython(promote_main_images, migrations.RunPython.noop),
    ]
