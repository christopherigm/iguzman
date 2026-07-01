from django.db import migrations, models
from django.utils.text import slugify


def populate_slugs(apps, schema_editor):
    """
    Backfill a unique slug for every existing Movie from its title + year,
    mirroring Movie._generate_unique_slug. Runs while the column is still
    non-unique so the AlterField that follows can safely add the constraint.
    """
    Movie = apps.get_model('catalog', 'Movie')
    seen = set()
    for movie in Movie.objects.all().order_by('id'):
        base = slugify(movie.title) or 'movie'
        if movie.year:
            base = f'{base}-{movie.year}'
        slug = base
        suffix = 2
        while slug in seen:
            slug = f'{base}-{suffix}'
            suffix += 1
        seen.add(slug)
        movie.slug = slug
        movie.save(update_fields=['slug'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0010_movieownership_digital_copy_url_seed_digital_format'),
    ]

    operations = [
        migrations.AddField(
            model_name='movie',
            name='slug',
            # db_index=False on purpose: SlugField defaults to db_index=True,
            # which makes Postgres create a `catalog_movie_slug_..._like`
            # (varchar_pattern_ops) index here. The AlterField below then adds
            # unique=True and recreates a `_like` index with the same
            # deterministic name without dropping the first, raising
            # "relation ..._like already exists". Skipping the index here lets
            # the AlterField create it exactly once. (SQLite has no `_like`
            # indexes, so this only bites on Postgres.)
            field=models.SlugField(blank=True, default='', max_length=560, db_index=False),
            preserve_default=False,
        ),
        migrations.RunPython(populate_slugs, noop),
        migrations.AlterField(
            model_name='movie',
            name='slug',
            field=models.SlugField(blank=True, db_index=True, max_length=560, unique=True),
        ),
    ]
