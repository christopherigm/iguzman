from django.db import migrations, models


def default_to_removable(apps, schema_editor):
    """Remap the dropped ``is_default`` onto ``is_removable``.

    New model: ``is_removable=False`` *is* "included by default" (locked, in the
    base price); ``is_removable=True`` is an optional add-on. To preserve which
    rows are included in the base, an old default (``is_default=True``) becomes
    non-removable (locked-included) and an old add-on becomes removable.
    """
    MenuItemIngredient = apps.get_model('catalog', 'MenuItemIngredient')
    MenuItemIngredient.objects.filter(is_default=True).update(is_removable=False)
    MenuItemIngredient.objects.filter(is_default=False).update(is_removable=True)


def removable_to_default(apps, schema_editor):
    """Reverse: reconstruct ``is_default`` as the inverse of ``is_removable``."""
    MenuItemIngredient = apps.get_model('catalog', 'MenuItemIngredient')
    MenuItemIngredient.objects.filter(is_removable=False).update(is_default=True)
    MenuItemIngredient.objects.filter(is_removable=True).update(is_default=False)


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0021_ingredient_catalog'),
    ]

    operations = [
        migrations.AddField(
            model_name='menuitem',
            name='portions',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                help_text='Number of servings this dish yields. Drives the '
                          'per-serving figures and the "servings per item" line '
                          'on the public nutrition label.',
            ),
        ),
        migrations.AlterField(
            model_name='menuitemingredient',
            name='is_removable',
            field=models.BooleanField(
                default=False,
                help_text='On: an optional add-on the customer chooses '
                          '(0..max_quantity), each unit charged at price. Off: '
                          'included by default in the base price and locked into '
                          'the dish.',
            ),
        ),
        migrations.RunPython(default_to_removable, removable_to_default),
        migrations.RemoveField(
            model_name='menuitemingredient',
            name='is_default',
        ),
    ]
