"""What a contributor can see and do with the records they filed.

For a long time this feature had exactly one direction: ``core/contribute_views.py``
let a signed-in reader POST a species, a place or a sighting, and that was the
end of it. The row landed ``enabled=False`` and disappeared - the flow could
confirm the submission but never track it, and a contributor who mistyped a date
or uploaded a blurry photograph had no way to fix either. ``apps/animals``'
**My contributions** page is the other direction, and this module is its API.

Three endpoints:

    GET                 /api/contributions/                 the merged list
    GET/PATCH/DELETE    /api/contributions/<type>/<pk>/     one record

``<type>`` is one of ``sightings``, ``species``, ``locations`` - the same three
segments the contribute URLs use.

Five things that decide the shape of this module:

* ⚠ **Nothing here is cached, and that is the whole reason it is a separate
  view rather than a ``?mine=true`` on the public lists.** Every cached payload
  in this project is keyed by the query params and the resolved
  disabled-visibility, and by **nothing about the caller** - so a per-user
  response written into one of those namespaces would be replayed to the next
  reader who happened to ask the same question. That is the
  ``Location.hide_precise_location`` trap, and it is why the alternative (a
  filter on the existing lists) would have needed its own namespace or no
  caching at all. This is the "separate uncached view" that animals-api's
  CLAUDE.md called almost certainly right.
* ⚠ **Ownership is the query, not a check after it.** Every queryset here is
  filtered by ``created_by=request.user`` before anything else happens, and the
  detail view looks a row up *within* that filter - so somebody else's pk
  answers **404**, never 403. Whether a given id exists is not this caller's
  business, which is the same call ``SightingContributeVideoView`` makes.
* **The models are reached by label, not by import.** ``core`` is imported *by*
  ``catalog`` and ``journal``, so importing them back at module level would be a
  cycle; ``apps.get_model`` and ``import_string`` resolve both lazily, exactly as
  ``core/backup.py``'s ``MODEL_SPECS`` does with its dotted labels.
* **The list rows are hand-built, not serialized through the read serializers.**
  A contributor's grid needs a cover, a name, a date and a status - not a
  species' full gallery, prose and per-object ``sighting_count``. The detail
  view *does* use the record's normal read serializer, because the edit form
  prefills from it and should see exactly what every other read sees.
* **Deleting is allowed and may still be refused.** ``PROTECT`` guards a species
  that other people's sightings now reference, which is a 409 with a readable
  sentence rather than a 500 - the same answer ``core/views.py`` gives.
"""

from dataclasses import dataclass

from django.apps import apps
from django.db.models import ProtectedError
from django.utils.module_loading import import_string
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .permissions import IsContributor
from .serializers import file_url, gallery_image_url

__all__ = [
    'CONTRIBUTION_TYPES',
    'MAX_CONTRIBUTIONS_SCAN',
    'MyContributionDetailView',
    'MyContributionListView',
    'contribution_status',
]

# How far into one account's own history the merged list will read per type
# before it stops. A contributor's own rows are a small set by nature - this is
# a safety ceiling on a full-table serialize, not a page size, and the paging
# below happens inside it.
MAX_CONTRIBUTIONS_SCAN = 500

# Cap on one page, matching `core.views.MAX_PAGE_SIZE`.
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 24


# ---------------------------------------------------------------------------
# The three types
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ContributionType:
    """One contributable record, described by label rather than by import."""

    #: The URL segment, and the value of `?type=`.
    key: str
    #: What one row calls itself on the payload - singular, for the frontend's
    #: badge and its per-type detail route.
    kind: str
    model_label: str
    read_serializer: str
    update_serializer: str
    #: Joined for the card builder below, so a list of 50 does not cost 50 extra
    #: queries resolving each row's species or category name.
    select_related: tuple = ()
    prefetch_related: tuple = ()


CONTRIBUTION_TYPES = {
    'sightings': ContributionType(
        key='sightings',
        kind='sighting',
        model_label='journal.Sighting',
        read_serializer='journal.serializers.SightingSerializer',
        update_serializer='journal.serializers.SightingContributeUpdateSerializer',
        # `created_by` is joined because the read serializer derives the credit
        # line from it - see `journal/views.py`.
        select_related=('species', 'species__category', 'location', 'season',
                        'weather', 'created_by'),
        prefetch_related=('media',),
    ),
    'species': ContributionType(
        key='species',
        kind='species',
        model_label='catalog.Species',
        read_serializer='catalog.serializers.SpeciesSerializer',
        update_serializer='catalog.serializers.SpeciesContributeUpdateSerializer',
        select_related=('category',),
        prefetch_related=('images',),
    ),
    'locations': ContributionType(
        key='locations',
        kind='location',
        model_label='catalog.Location',
        read_serializer='catalog.serializers.LocationSerializer',
        update_serializer='catalog.serializers.LocationContributeUpdateSerializer',
        select_related=('parent', 'county', 'county__state',
                        'county__state__country'),
        prefetch_related=('images',),
    ),
}


def _model(spec):
    return apps.get_model(spec.model_label)


def _owned(spec, user):
    """This account's own rows of one type, newest first.

    ⚠ The ownership filter is the queryset itself - see the module docstring.
    `is_contribution=True` is deliberately **not** part of it: a row is one of
    this account's contributions because this account filed it, and an
    administrator who tidied the flag off a record should not thereby make it
    unreachable to the person who submitted it.
    """
    qs = _model(spec).objects.filter(created_by=user)
    if spec.select_related:
        qs = qs.select_related(*spec.select_related)
    if spec.prefetch_related:
        qs = qs.prefetch_related(*spec.prefetch_related)
    return qs.order_by('-created')


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

STATUS_PENDING = 'pending'
STATUS_PUBLISHED = 'published'
STATUS_IN_REVIEW = 'in_review'


def contribution_status(obj) -> str:
    """Which of the three states a contribution is in, for the frontend's badge.

    ``pending`` and ``in_review`` are **both** ``enabled=False`` and differ only
    by ``was_published``, which is exactly why that column exists (see
    ``core.models.was_published_field``): "we have not looked at this yet" and
    "this was live, you changed it, and we are looking again" are the same row
    state but very different things to be told - the second means the entry has
    come *off* a page it used to be on.
    """
    if obj.enabled:
        return STATUS_PUBLISHED
    return STATUS_IN_REVIEW if obj.was_published else STATUS_PENDING


# ---------------------------------------------------------------------------
# The card
# ---------------------------------------------------------------------------

def _card(spec, obj, request):
    """One row of the merged list: enough to draw a grid tile, and no more.

    Hand-built rather than run through the record's read serializer, because a
    grid of 24 tiles does not need 24 galleries, 24 descriptions and - for a
    species - 24 pairs of per-object count queries. What every type carries is
    the same six fields, so the frontend renders one card component with a badge;
    what differs is the short subtitle line under the name.
    """
    # `name` may be blank on a sighting (the API titles it after its species when
    # the contributor left the field empty), so it falls back the same way the
    # read payload does.
    name = getattr(obj, 'name', None)

    row = {
        'type': spec.kind,
        'id': obj.pk,
        'slug': obj.slug,
        'name': name,
        'en_name': getattr(obj, 'en_name', None),
        'status': contribution_status(obj),
        'enabled': obj.enabled,
        'was_published': obj.was_published,
        'created': obj.created,
        'modified': obj.modified,
    }

    if spec.kind == 'sighting':
        from journal.serializers import sighting_cover_url

        row['image'] = sighting_cover_url(obj, request)
        row['date'] = obj.date
        row['species_name'] = obj.species.name if obj.species_id else None
        row['species_en_name'] = obj.species.en_name if obj.species_id else None
        row['location_name'] = obj.location.name if obj.location_id else None
        row['location_en_name'] = (
            obj.location.en_name if obj.location_id else None
        )
        # What the edit form needs to know before it opens: a clip cannot be
        # added to an entry that already has one.
        row['has_video'] = any(
            m.kind in ('video', 'link') for m in obj.media.all()
        )
    else:
        row['image'] = gallery_image_url(obj, request)
        row['date'] = None

    if spec.kind == 'species':
        row['scientific_name'] = obj.scientific_name
        row['category_name'] = obj.category.name if obj.category_id else None
        row['category_en_name'] = (
            obj.category.en_name if obj.category_id else None
        )
    elif spec.kind == 'location':
        row['place_type'] = obj.place_type
        row['county_name'] = obj.county.name if obj.county_id else None

    # A species and a place wear a glyph; a sighting has none. The map pin and
    # the card's fallback both read it, so it travels when the model has one.
    if hasattr(obj, 'icon'):
        row['icon'] = file_url(obj.icon, request)

    return row


def _int_param(params, name, default):
    try:
        return int(params[name])
    except (KeyError, TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

class MyContributionListView(APIView):
    """
    GET /api/contributions/ - everything this account has filed, newest first.

    Query params: ``type`` (one of the three keys, omit for all), ``status``
    (``pending`` / ``published`` / ``in_review``), ``limit``, ``offset``.

    Answers the paginated envelope the journal feed uses
    (``{count, limit, offset, results}``) rather than a bare list, because this
    one grows with everything its owner ever submits.

    **The merge happens in Python, and it has to.** These are three tables with
    no common ancestor, so there is no queryset that spans them - and inventing
    one (a `Contribution` join table) would be a migration of the whole feature
    for a list one person reads. Each type is read to `MAX_CONTRIBUTIONS_SCAN`,
    the three are merged on `created` and the page is sliced out of that. The
    ceiling is what stops a prolific contributor's page from serializing their
    entire history; `?type=` is how they page past it.
    """

    permission_classes = [IsContributor]

    def get(self, request):
        params = request.query_params
        user = request.user

        requested = params.get('type')
        if requested and requested not in CONTRIBUTION_TYPES:
            return Response(
                {'detail': f'Unknown contribution type: {requested}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        specs = (
            [CONTRIBUTION_TYPES[requested]] if requested
            else list(CONTRIBUTION_TYPES.values())
        )

        wanted_status = params.get('status')
        if wanted_status and wanted_status not in (
            STATUS_PENDING, STATUS_PUBLISHED, STATUS_IN_REVIEW
        ):
            return Response(
                {'detail': f'Unknown status: {wanted_status}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rows = []
        for spec in specs:
            qs = _owned(spec, user)
            # Narrowed in SQL where it can be: `published` and "not published"
            # are the `enabled` column, and only telling the two unpublished
            # states apart needs `was_published`.
            if wanted_status == STATUS_PUBLISHED:
                qs = qs.filter(enabled=True)
            elif wanted_status in (STATUS_PENDING, STATUS_IN_REVIEW):
                qs = qs.filter(
                    enabled=False,
                    was_published=(wanted_status == STATUS_IN_REVIEW),
                )
            rows.extend(
                _card(spec, obj, request) for obj in qs[:MAX_CONTRIBUTIONS_SCAN]
            )

        rows.sort(key=lambda row: row['created'], reverse=True)

        limit = max(1, min(MAX_PAGE_SIZE, _int_param(params, 'limit', DEFAULT_PAGE_SIZE)))
        offset = max(0, _int_param(params, 'offset', 0))

        return Response({
            'count': len(rows),
            'limit': limit,
            'offset': offset,
            'results': rows[offset:offset + limit],
        })


class MyContributionDetailView(APIView):
    """
    GET    /api/contributions/<type>/<pk>/ - one record, in its normal read shape.
    PATCH  /api/contributions/<type>/<pk>/ - correct it; **returns it to review**.
    DELETE /api/contributions/<type>/<pk>/ - withdraw it.

    ⚠ **A PATCH un-publishes.** Editing a contribution an administrator has
    already put on the site takes it back off until the edit is reviewed - see
    ``ContributionUpdateSerializer.update``, which is where that happens and why.
    The frontend has to warn before saving; the response carries the new
    ``contribution_status`` so it can say what happened afterwards.

    Nothing here invalidates a cache by hand. Every write below is an ordinary
    ``save()`` or ``delete()`` on a model whose ``post_save``/``post_delete``
    receivers already clear the right namespaces - those receivers are this
    project's primary invalidation path, not a backstop (see both ``signals.py``).
    """

    permission_classes = [IsContributor]

    def _resolve(self, type_key, pk, user):
        """``(spec, instance)``, or ``(None, None)`` when this caller has no such row."""
        spec = CONTRIBUTION_TYPES.get(type_key)
        if spec is None:
            return None, None
        # Looked up *inside* the ownership filter, so another account's pk is
        # indistinguishable from one that does not exist.
        return spec, _owned(spec, user).filter(pk=pk).first()

    def _payload(self, spec, instance, request):
        """The record's normal read payload, plus what only a contributor needs."""
        serializer = import_string(spec.read_serializer)
        data = serializer(instance, context={'request': request}).data
        return {
            **data,
            'type': spec.kind,
            'contribution_status': contribution_status(instance),
            'was_published': instance.was_published,
        }

    def get(self, request, type_key, pk):
        spec, instance = self._resolve(type_key, pk, request.user)
        if instance is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._payload(spec, instance, request))

    def patch(self, request, type_key, pk):
        spec, instance = self._resolve(type_key, pk, request.user)
        if instance is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer_class = import_string(spec.update_serializer)
        serializer = serializer_class(
            instance, data=request.data, partial=True, context={'request': request}
        )
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()

        # Re-read through the same joins the card and the payload assume: the
        # update wrote gallery rows through a second serializer, so the prefetch
        # this instance was loaded with is stale.
        instance = _owned(spec, request.user).filter(pk=instance.pk).first()
        return Response(self._payload(spec, instance, request))

    def delete(self, request, type_key, pk):
        spec, instance = self._resolve(type_key, pk, request.user)
        if instance is None:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            instance.delete()
        except ProtectedError:
            # A published species that other people's sightings now reference is
            # no longer only its proposer's to withdraw - `PROTECT` is what stops
            # a contributor taking years of somebody else's journal entries with
            # them. Same answer `core/views.py` gives an administrator.
            return Response(
                {'detail': (
                    f'This {spec.kind} is referenced by other records and cannot '
                    f'be deleted. Ask an administrator.'
                )},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
