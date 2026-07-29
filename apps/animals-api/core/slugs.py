"""Server-side slug generation, for rows nobody types a slug for.

The CMS derives a slug in the browser as the author types the name
(``apps/animals``' ``use-derived-slug.ts``) and PATCHes it like any other field,
which is why every write serializer here takes ``slug`` as a plain required
field. The **public contribute flow** has no such field: asking a reader filing a
sighting to invent a URL segment would be asking them to do the CMS's job, so the
API derives it instead - which means it also has to guarantee uniqueness, since a
collision on ``slug`` is an IntegrityError rather than a validation error the
contributor could act on.
"""

from django.utils.text import slugify

__all__ = ['unique_slug']

# Room for the `-NN` suffix inside a SlugField(max_length=255).
_MAX_LENGTH = 255
_SUFFIX_ROOM = 8


def unique_slug(model, value, fallback='entry', max_length=_MAX_LENGTH):
    """A slug derived from ``value`` that no ``model`` row holds yet.

    Falls back to ``fallback`` when the text slugifies to nothing at all, which
    is not an edge case: a name written entirely in a non-Latin script leaves
    ``slugify`` with an empty string.

    The suffix is a counter rather than a random token so the second "Red Fox"
    reads as ``red-fox-2``, which is a URL someone can recognise. It is checked
    against the table in a loop; two simultaneous contributions of the same name
    can still collide, and the caller is expected to be inside a transaction that
    will roll back rather than to treat this as a lock.
    """
    base = slugify(value or '')[: max_length - _SUFFIX_ROOM] or fallback

    if not model.objects.filter(slug=base).exists():
        return base

    counter = 2
    while True:
        candidate = f'{base}-{counter}'
        if not model.objects.filter(slug=candidate).exists():
            return candidate
        counter += 1
