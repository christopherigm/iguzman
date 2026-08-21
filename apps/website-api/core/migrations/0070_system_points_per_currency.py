from decimal import Decimal

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0069_system_rewards_enabled'),
    ]

    operations = [
        migrations.AddField(
            model_name='system',
            name='points_per_currency',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('1.00'),
                help_text=(
                    'Points a customer earns per 1 unit of currency spent. Used by the '
                    'CMS calculator to work out an item\'s points, not at checkout.'
                ),
                max_digits=10,
            ),
        ),
    ]
