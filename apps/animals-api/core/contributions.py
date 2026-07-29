"""What the public contribute flow shares between the two things it can create.

``apps/animals`` grew a public, staged "add a record" flow for signed-in readers
(a FAB on a category page proposes a **species**, one on a sighting page files a
**sighting**), and both halves of it need the same three things:

* **a photo list**, uploaded as base64 in one request with the record itself,
  rather than the CMS's write-the-gallery-after-save dance - a contributor has
  one Submit button, and a half-created record with no pictures is worse than a
  failed one;
* **a hard ceiling** on how much one anonymous-ish request may cost; and
* **the same moderation contract**: the row is created ``enabled=False``, marked
  ``is_contribution``, stamped with ``created_by``, and may not set any field an
  administrator owns.

Everything here is deliberately narrow. The contribute serializers do **not**
subclass the CMS write serializers, because inheriting a field list is exactly how
``is_featured`` or ``enabled`` would one day become writable by the public: the
field lists are separate on purpose, and the only way to widen the public one is
to type the field into it.
"""

from rest_framework import serializers

from .image_sizes import REGULAR, image_cfg
from .serializers import ImageProcessingSerializer

__all__ = [
    'MAX_CONTRIBUTION_PHOTOS',
    'MAX_TEXT_LENGTH',
    'ContributionSerializer',
    'photos_field',
]

# One outing's worth of pictures. The cap is about cost, not taste: every photo
# in this payload is decoded and resized in-process, so an uncapped list is a way
# to hold a worker for as long as the request body is allowed to be.
MAX_CONTRIBUTION_PHOTOS = 10

# A generous field-note, still short of a request that exists to fill the column.
MAX_TEXT_LENGTH = 5000


def photos_field(required=True):
    """The ``photos`` field: base64 data URLs, in the order they should appear.

    Order is the whole payload's meaning beyond the pictures themselves - the API
    publishes a record's **first** gallery row as its cover (see this app's
    CLAUDE.md), so ``photos[0]`` is the contributor's chosen cover.
    """
    return serializers.ListField(
        child=serializers.CharField(),
        required=required,
        allow_empty=not required,
        min_length=1 if required else 0,
        max_length=MAX_CONTRIBUTION_PHOTOS,
    )


class ContributionSerializer(serializers.ModelSerializer):
    """Base for the two public create serializers.

    A subclass declares its own ``Meta.fields`` (never inherited - see the module
    docstring), sets ``photo_write_serializer_class`` to the gallery writer for
    its parent, and implements nothing else: ``create`` stamps the moderation
    fields and writes the photos.
    """

    #: The existing gallery write serializer for this record's photo table. Its
    #: ``save(parent)`` is what turns one base64 string into a stored row, so the
    #: contribute path shares the CMS's image pipeline rather than a second copy.
    photo_write_serializer_class = None

    def validate_photos(self, value):
        """Reject an undecodable photo *before* the parent row is created.

        Without this the first bad data URL in a list of eight would fail halfway
        through writing the gallery, leaving a published-nowhere record with three
        of its photos. Validation up front, writes after the row exists.
        """
        for index, raw in enumerate(value):
            sub = ImageProcessingSerializer(
                data={'base64_image': raw}, **image_cfg(REGULAR)
            )
            if not sub.is_valid():
                raise serializers.ValidationError(
                    {str(index): sub.errors['base64_image']}
                )
        return value

    def _request_user(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return user if (user is not None and user.is_authenticated) else None

    def _write_photos(self, instance, photos):
        writer = self.photo_write_serializer_class
        for index, raw in enumerate(photos):
            sub = writer(data={'image': raw, 'sort_order': index})
            # Already validated in `validate_photos`; this second pass is the
            # writer's own field coercion, not a re-check of the payload.
            sub.is_valid(raise_exception=True)
            sub.save(instance)
