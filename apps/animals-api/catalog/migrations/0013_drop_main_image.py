"""Drop the retired ``image`` column from all five catalog records.

``0012_main_image_into_gallery`` moved every value it held into that record's
first gallery row and emptied it; this removes the column itself, and with it the
last of the two-places-to-pick-a-cover design. From here
``core.serializers.gallery_image_url`` has exactly one answer: ``images[0]``.

The four picture models lose the column by **reparenting** - ``Category``,
``Species``, ``Season`` and ``WeatherCondition`` now inherit ``BasePicture``
rather than ``RegularPlusPicture``, which is the same base minus ``image``. That
is the only way to shed an inherited field, and it is safe here precisely because
the concrete tables still carry every other column: ``BasePicture`` is the base
``RegularPlusPicture`` is built from. ``Location`` declared its own copy (added
in ``0010_location_image``) and simply drops it. ``GalleryImage`` and
``journal.SightingMedia`` keep ``RegularPlusPicture`` - the photograph *is* their
``image``.

**The promotion runs once more first, and that is not belt-and-braces.** 0012
shipped in the deploy that removed the uploader, but the Django admin's form
could still write the column until the same release took it off the fieldsets,
and anything written straight into the database never went through either. A
column dropped with a file still in it is a photograph gone with nothing to say
so, so any straggler is promoted the same way 0012 promotes: pushed in at
``sort_order`` 0, ahead of the gallery. It is a no-op on a database that has
already been through 0012 and had nothing added since - which is the expected
case, and the case the author of this change confirmed by hand.

⚠ **Irreversible.** The backwards path re-adds the columns, so the schema can be
rolled back, but every value is gone by then - and the photographs are not lost,
they are gallery rows. Restoring a backup archive taken before 0012 no longer
carries those covers over either: ``core.backup`` builds a row from the model's
*current* concrete fields, so an archived ``image`` key now finds no field and is
skipped. A pre-0012 archive therefore restores each record's gallery, and a
record whose only photograph lived in that column restores with none. That was
the accepted trade for retiring the column outright.
"""

from django.db import migrations
from django.db.models import F

# parent model -> (child model, the child's FK field), as in 0012.
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
def promote_stragglers(apps, schema_editor):
    """Anything 0012 could not have seen, promoted the same way it promotes."""
    for parent_name, child_name, fk in GALLERIES:
        Parent = apps.get_model('catalog', parent_name)
        Child = apps.get_model('catalog', child_name)
        for obj in Parent.objects.exclude(image='').exclude(image=None).iterator():
            Child.objects.filter(**{fk: obj}).update(sort_order=F('sort_order') + 1)
            row = Child.objects.create(**{fk: obj}, sort_order=0)
            Child.objects.filter(pk=row.pk).update(image=obj.image.name)


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0012_main_image_into_gallery'),
    ]

    operations = [
        migrations.RunPython(promote_stragglers, migrations.RunPython.noop),
        migrations.RemoveField(model_name='category', name='image'),
        migrations.RemoveField(model_name='species', name='image'),
        migrations.RemoveField(model_name='season', name='image'),
        migrations.RemoveField(model_name='weathercondition', name='image'),
        migrations.RemoveField(model_name='location', name='image'),
    ]
