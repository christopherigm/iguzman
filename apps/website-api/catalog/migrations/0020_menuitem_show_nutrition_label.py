from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0019_alter_menuitemingredient_quantity'),
    ]

    operations = [
        migrations.AddField(
            model_name='menuitem',
            name='show_nutrition_label',
            field=models.BooleanField(
                default=True,
                help_text='Show the calorie/nutrition breakdown card on the public detail page.',
            ),
        ),
    ]
