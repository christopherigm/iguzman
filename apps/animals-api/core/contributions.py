"""What the public contribute flow shares across the three things it can create.

``apps/animals`` grew a public, staged "add a record" flow for signed-in readers
- a FAB on a category page proposes a **species**, one on a sighting page files a
**sighting**, and an inline panel in that form adds a **place** - and every one of
them needs the same three things:

* **a photo list**, uploaded as base64 in one request with the record itself,
  rather than the CMS's write-the-gallery-after-save dance - a contributor has
  one Submit button, and a half-created record with no pictures is worse than a
  failed one;
* **a hard ceiling** on how much one anonymous-ish request may cost; and
* **the same moderation contract**: the row is created ``enabled=False``, marked
  ``is_contribution``, stamped with ``created_by``, and may not set any field an
  administrator owns.

The module has **two halves**. Everything above ``ContributionUpdateSerializer``
is the create path; everything below it is the edit path that ``apps/animals``'
"My contributions" page reads and writes, which is a later and wider grant - a
contributor may now list, correct and delete what they filed. See
``core/my_contributions.py`` for the views, and the section comment on the edit
half for the two rules editing adds.

Everything here is deliberately narrow. The contribute serializers do **not**
subclass the CMS write serializers, and the edit serializers do not subclass the
create ones, because inheriting a field list is exactly how ``is_featured`` or
``enabled`` would one day become writable by the public: the field lists are
separate on purpose, and the only way to widen a public one is to type the field
into it.
"""

from django.db import transaction
from rest_framework import serializers

from .image_sizes import photo_cfg
from .serializers import ImageProcessingSerializer

__all__ = [
    'MAX_CONTRIBUTION_PHOTOS',
    'MAX_TEXT_LENGTH',
    'ContributionSerializer',
    'ContributionUpdateSerializer',
    'photos_field',
    'photos_patch_field',
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
            # The same tier the gallery writer below stores at - this pass only
            # decides whether the payload decodes, so a smaller box here would
            # reject nothing but would make the two halves read as different
            # rules.
            sub = ImageProcessingSerializer(
                data={'base64_image': raw}, **photo_cfg()
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


# ---------------------------------------------------------------------------
# Editing a contribution back
# ---------------------------------------------------------------------------
#
# The create serializers above were, for a long time, the whole of this feature:
# a contributor filed a record and never saw it again. `apps/animals`' "My
# contributions" page is what changed that, and it needs the same three records
# to be **readable, editable and deletable by the account that filed them** -
# which is a wider grant than creating, and so is written with the same
# separate-serializer discipline rather than by relaxing anything.
#
# Two rules the update path adds, and neither belongs to a single model:
#
# * **Editing a published contribution takes it off the site.** `enabled` is not
#   writable here (it never is on a contribute serializer), but a PATCH from its
#   author flips it to False, so a live record returns to the review queue rather
#   than the public seeing an unreviewed edit. `was_published` is what then tells
#   that state apart from a first submission - see `core.models`.
# * **The photo list is a diff, not an append.** See `photos_patch_field`.


class PhotoPatchItem(serializers.Serializer):
    """One entry in a `photos` diff: either a row to keep, or a photo to add.

    Exactly one of the two, and never both - an item carrying an `id` *and* an
    `image` would be asking to replace a stored photograph in place, which is a
    thing this flow deliberately cannot do: the gallery row's filename embeds its
    pk and its `sort_order` is the record's cover, so "replace" is unambiguously
    a delete plus an add, and saying so in the payload keeps the diff readable.
    """

    id = serializers.IntegerField(required=False)
    image = serializers.CharField(required=False)

    def validate(self, attrs):
        has_id = attrs.get('id') is not None
        has_image = bool(attrs.get('image'))
        if has_id == has_image:
            raise serializers.ValidationError(
                'Each photo must carry either an "id" (keep this row) or an '
                '"image" (add this one), and not both.'
            )
        if has_image:
            sub = ImageProcessingSerializer(
                data={'base64_image': attrs['image']}, **photo_cfg()
            )
            if not sub.is_valid():
                raise serializers.ValidationError(
                    {'image': sub.errors['base64_image']}
                )
        return attrs


def photos_patch_field(required=True):
    """The `photos` field on an **edit**: the gallery as it should be afterwards.

    ⚠ **The list is the whole gallery, not the additions to it.** A row whose id
    is absent is *deleted*, a bare `image` is created, and `sort_order` is simply
    the index in this array - which is what makes re-ordering and changing the
    cover free rather than three more endpoints. `photos[0]` is the cover here
    exactly as it is on create (see `photos_field`).

    That contract is the reason the edit form can keep the create form's single
    Submit button. The alternative - add, delete and reorder as separate calls,
    which is what the CMS's gallery editor does - is right for an author working
    through a long list, and wrong for a contributor fixing one blurry photo on a
    phone: it turns one intention into three requests that can each half-fail.

    Omitting the field entirely leaves the gallery untouched, which is what a
    PATCH that only edits the prose sends.
    """
    return serializers.ListField(
        child=PhotoPatchItem(),
        required=required,
        allow_empty=not required,
        min_length=1 if required else 0,
        max_length=MAX_CONTRIBUTION_PHOTOS,
    )


class ContributionUpdateSerializer(serializers.ModelSerializer):
    """Base for the three public **edit** serializers.

    A sibling of both the CMS write serializer and the contribute *create*
    serializer, for the reason the module docstring gives: a field list that is
    inherited is a field list that can widen by accident, and this one is reached
    by any signed-in account.

    A subclass declares its own `Meta.fields`, sets
    `photo_write_serializer_class`, and overrides `photo_rows` when its gallery
    is not `instance.images` (a sighting's is `media`, which also holds clips).
    """

    #: The gallery writer for this record's photo table - the same one the create
    #: serializer uses, so both paths share the CMS's image pipeline.
    photo_write_serializer_class = None

    def photo_rows(self, instance):
        """The gallery rows this diff may delete. Photos only, never clips."""
        return instance.images.all()

    def _sync_photos(self, instance, photos):
        """Make the stored gallery match `photos`, in that order.

        Three passes, in this order and for a reason: the ids are resolved
        against **this record's own rows** first (so an id belonging to somebody
        else's gallery is a validation error rather than a silent no-op), the
        rows that survived are renumbered, and only then is anything deleted.
        """
        existing = {row.id: row for row in self.photo_rows(instance)}

        keep_ids = [item['id'] for item in photos if item.get('id') is not None]
        unknown = [pk for pk in keep_ids if pk not in existing]
        if unknown:
            raise serializers.ValidationError(
                {'photos': f'No such photo on this record: {unknown[0]}.'}
            )

        writer = self.photo_write_serializer_class
        for index, item in enumerate(photos):
            pk = item.get('id')
            if pk is not None:
                row = existing[pk]
                # `sort_order` is the cover, so this is the whole of what a
                # re-order writes - see `core.serializers.gallery_image_url`.
                if row.sort_order != index:
                    row.sort_order = index
                    row.save(update_fields=['sort_order'])
                continue

            sub = writer(data={'image': item['image'], 'sort_order': index})
            # Already validated by `PhotoPatchItem`; this pass is the writer's
            # own field coercion, not a re-check of the payload.
            sub.is_valid(raise_exception=True)
            sub.save(instance)

        for pk, row in existing.items():
            if pk not in set(keep_ids):
                row.delete()

    def _request_user(self):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        return user if (user is not None and user.is_authenticated) else None

    @transaction.atomic
    def update(self, instance, validated_data):
        photos = validated_data.pop('photos', None)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        # ⚠ The edit itself un-publishes. A contributor may correct a record that
        # an administrator has already put on the site, and the correction has
        # not been reviewed - so it goes back into the queue rather than straight
        # onto the public page. `was_published` stays latched (see
        # `core.models.stamp_published`), which is what lets the frontend say
        # "back in review" instead of "awaiting first review".
        instance.enabled = False
        instance.save()

        if photos is not None:
            self._sync_photos(instance, photos)
        return instance
