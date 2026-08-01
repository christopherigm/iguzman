"""The public contribute flow, from both sides of the permission line.

Kept in ``core`` rather than split between ``catalog`` and ``journal`` because the
thing under test is one contract shared by both endpoints (``core/contributions.py``
+ ``core/contribute_views.py``), and the assertions that matter most are the ones
about what a contributor **cannot** do - which would be easy to write for one
resource and forget for the other.

Imported by ``core/tests.py`` so ``manage.py test`` picks it up.
"""

import json
from datetime import date, timedelta

from django.utils import timezone

from catalog.models import Category, Location, Species
from journal.models import Sighting, SightingMedia

from .tests import IsolatedMediaTestCase, base64_image

SPECIES_URL = '/api/catalog/species/contribute/'
SIGHTING_URL = '/api/journal/sightings/contribute/'
LOCATION_URL = '/api/catalog/locations/contribute/'


class ContributeFixtureMixin:
    def setUp(self):
        super().setUp()
        self.category = Category.objects.create(name='Venados', slug='venados', kind='animal')
        self.species = Species.objects.create(
            category=self.category, name='Venado cola blanca', slug='venado-cola-blanca'
        )
        self.place = Location.objects.create(name='La Primavera', slug='la-primavera')

    def sign_in_visitor(self):
        self.make_visitor()
        self.client.login(username='visitor', password='just-looking-2026')

    def species_body(self, **overrides):
        return {
            'category': self.category.pk,
            'name': 'Coyote',
            'photos': [base64_image()],
            **overrides,
        }

    def sighting_body(self, **overrides):
        # A fixed past date, because the journal orders by it and the serializer
        # refuses a future one - `timezone.localdate()` here would make the
        # ordering assertions depend on the day the suite happens to run.
        return {
            'species': self.species.pk,
            'name': 'Primer cervatillo',
            'date': '2026-05-14',
            'location': self.place.pk,
            'photos': [base64_image()],
            **overrides,
        }

    def location_body(self, **overrides):
        # No `photos` key: a place may be proposed without one, which is the
        # difference from the other two bodies above and is asserted below.
        return {
            'name': 'Laguna de Sayula',
            'latitude': '20.0123',
            'longitude': '-103.5678',
            **overrides,
        }

    def post(self, url, body):
        return self.client.post(url, body, content_type='application/json')


class ContributePermissionTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    """Signed in is the gate - and it is the *only* thing that gets widened."""

    def test_an_anonymous_visitor_may_not_contribute_a_species(self):
        self.assertEqual(self.post(SPECIES_URL, self.species_body()).status_code, 401)

    def test_an_anonymous_visitor_may_not_contribute_a_sighting(self):
        self.assertEqual(self.post(SIGHTING_URL, self.sighting_body()).status_code, 401)

    def test_a_signed_in_visitor_may_contribute_a_species(self):
        self.sign_in_visitor()
        self.assertEqual(self.post(SPECIES_URL, self.species_body()).status_code, 201)

    def test_a_signed_in_visitor_may_contribute_a_sighting(self):
        self.sign_in_visitor()
        self.assertEqual(self.post(SIGHTING_URL, self.sighting_body()).status_code, 201)

    def test_an_anonymous_visitor_may_not_contribute_a_location(self):
        self.assertEqual(self.post(LOCATION_URL, self.location_body()).status_code, 401)

    def test_a_signed_in_visitor_may_contribute_a_location(self):
        self.sign_in_visitor()
        self.assertEqual(self.post(LOCATION_URL, self.location_body()).status_code, 201)

    def test_the_locations_write_endpoint_is_still_admin_only(self):
        """`contribute/` sits above `<int:pk>/` on the same prefix - so this also
        proves the literal did not shadow, or get shadowed by, the CMS's routes."""
        self.sign_in_visitor()
        created = self.post(
            '/api/catalog/locations/', {'name': 'Direct', 'slug': 'direct-place'}
        )
        self.assertEqual(created.status_code, 403)
        self.assertEqual(
            self.client.patch(
                f'/api/catalog/locations/{self.place.pk}/',
                {'name': 'Renamed'},
                content_type='application/json',
            ).status_code,
            403,
        )

    def test_the_ordinary_write_endpoints_are_still_admin_only(self):
        """The whole safety argument: contributing did not open the CMS's doors.

        If this ever fails, the contribute permission has leaked onto the generic
        views and any account can edit the catalog directly.
        """
        self.sign_in_visitor()
        created = self.post(
            '/api/catalog/species/',
            {'category': self.category.pk, 'name': 'Direct', 'slug': 'direct'},
        )
        self.assertEqual(created.status_code, 403)

        patched = self.client.patch(
            f'/api/catalog/species/{self.species.pk}/',
            {'name': 'Renamed'},
            content_type='application/json',
        )
        self.assertEqual(patched.status_code, 403)
        self.assertEqual(
            self.client.delete(f'/api/catalog/species/{self.species.pk}/').status_code, 403
        )


class ContributeModerationTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    """A contribution is a pending draft, and nothing it sends can publish it."""

    def test_a_contributed_species_lands_disabled_and_flagged(self):
        self.sign_in_visitor()
        response = self.post(SPECIES_URL, self.species_body())

        row = Species.objects.get(pk=response.json()['id'])
        self.assertFalse(row.enabled)
        self.assertTrue(row.is_contribution)
        self.assertFalse(row.is_featured)
        self.assertEqual(row.created_by.username, 'visitor')

    def test_a_contributed_sighting_lands_disabled_and_flagged(self):
        self.sign_in_visitor()
        response = self.post(SIGHTING_URL, self.sighting_body())

        row = Sighting.objects.get(pk=response.json()['id'])
        self.assertFalse(row.enabled)
        self.assertTrue(row.is_contribution)
        self.assertFalse(row.is_featured)
        self.assertEqual(row.created_by.username, 'visitor')

    def test_a_contributor_cannot_publish_or_feature_by_sending_the_flags(self):
        """The fields are absent from `Meta.fields`, so DRF drops them silently.

        Asserted rather than assumed: the failure mode of a serializer that *did*
        accept them is a contributor publishing straight onto the landing page.
        """
        self.sign_in_visitor()
        for url, body in (
            (SPECIES_URL, self.species_body(enabled=True, is_featured=True, sort_order=99)),
            (SIGHTING_URL, self.sighting_body(enabled=True, is_featured=True)),
        ):
            with self.subTest(url=url):
                response = self.post(url, body)
                self.assertEqual(response.status_code, 201)
                self.assertFalse(response.json()['enabled'])
                self.assertFalse(response.json()['is_featured'])

    def test_a_pending_contribution_is_absent_from_every_public_read(self):
        self.sign_in_visitor()
        self.post(SIGHTING_URL, self.sighting_body(latitude='20.6', longitude='-103.5'))
        self.client.logout()

        feed = self.client.get('/api/journal/sightings/')
        self.assertEqual(feed.json()['count'], 0)
        self.assertEqual(self.client.get('/api/journal/sightings/map/').json(), [])
        self.assertEqual(self.client.get('/api/journal/stats/').json()['sighting_count'], 0)
        self.assertEqual(self.client.get('/api/catalog/species/').json()[0]['sighting_count'], 0)

    def test_a_pending_contribution_is_absent_even_with_include_disabled(self):
        """`include_disabled` resolves against *who is asking* - see show_disabled."""
        self.sign_in_visitor()
        self.post(SPECIES_URL, self.species_body())

        visible = self.client.get('/api/catalog/species/?include_disabled=true').json()
        self.assertEqual([row['slug'] for row in visible], ['venado-cola-blanca'])

    def test_an_administrator_sees_the_queue_through_the_normal_list(self):
        """No moderation endpoint exists, and none is needed: the CMS sends
        `include_disabled=true` on every list read, so a pending contribution is
        simply an unpublished row in the species list."""
        self.sign_in_visitor()
        self.post(SPECIES_URL, self.species_body())
        self.client.logout()

        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        rows = self.client.get('/api/catalog/species/?include_disabled=true').json()
        pending = [row for row in rows if row['slug'] == 'coyote']
        self.assertEqual(len(pending), 1)
        self.assertFalse(pending[0]['enabled'])

    def test_publishing_a_contribution_is_an_ordinary_admin_patch(self):
        self.sign_in_visitor()
        pk = self.post(SIGHTING_URL, self.sighting_body()).json()['id']
        self.client.logout()

        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.patch(
            f'/api/journal/sightings/{pk}/',
            {'enabled': True},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)

        self.client.logout()
        self.assertEqual(self.client.get('/api/journal/sightings/').json()['count'], 1)


class ContributePhotoTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    def test_photos_are_written_in_order_and_the_first_becomes_the_cover(self):
        """The API publishes a record's first gallery row as its `image`, so
        `photos[0]` is the contributor's chosen cover."""
        self.sign_in_visitor()
        response = self.post(
            SIGHTING_URL,
            self.sighting_body(photos=[base64_image(color=(10, 20, 30)), base64_image()]),
        )
        payload = response.json()

        rows = SightingMedia.objects.filter(sighting_id=payload['id']).order_by('sort_order')
        self.assertEqual([row.sort_order for row in rows], [0, 1])
        self.assertTrue(all(row.kind == 'image' for row in rows))
        # `endswith`, not equality: the payload absolutises against the request
        # (`http://testserver/media/…`) while the field's own `url` is the path.
        self.assertTrue(payload['image'].endswith(rows[0].image.url))

    def test_at_least_one_photo_is_required(self):
        self.sign_in_visitor()
        for url, body in ((SPECIES_URL, self.species_body()), (SIGHTING_URL, self.sighting_body())):
            with self.subTest(url=url):
                body.pop('photos')
                self.assertEqual(self.post(url, body).status_code, 400)

    def test_an_undecodable_photo_creates_nothing_at_all(self):
        """Validated before the parent row exists, so a bad photo halfway down a
        list cannot leave a pending record holding two of its five pictures."""
        self.sign_in_visitor()
        response = self.post(
            SIGHTING_URL,
            self.sighting_body(photos=[base64_image(), 'not-an-image']),
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sighting.objects.count(), 0)
        self.assertEqual(SightingMedia.objects.count(), 0)

    def test_more_photos_than_the_ceiling_is_refused(self):
        self.sign_in_visitor()
        response = self.post(SPECIES_URL, self.species_body(photos=[base64_image()] * 11))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Species.objects.filter(is_contribution=True).count(), 0)


class ContributeSlugTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    """Nobody types a slug in the public flow, so the API derives a unique one."""

    def test_the_slug_is_derived_from_the_name(self):
        self.sign_in_visitor()
        response = self.post(SPECIES_URL, self.species_body(name='Zorro gris'))
        self.assertEqual(response.json()['slug'], 'zorro-gris')

    def test_a_second_contribution_of_the_same_name_gets_a_counter(self):
        self.sign_in_visitor()
        first = self.post(SPECIES_URL, self.species_body(name='Zorro gris'))
        second = self.post(SPECIES_URL, self.species_body(name='Zorro gris'))
        self.assertEqual(first.json()['slug'], 'zorro-gris')
        self.assertEqual(second.json()['slug'], 'zorro-gris-2')

    def test_an_untitled_sighting_takes_its_slug_from_the_species(self):
        """`name` is optional on an entry - the frontend falls back to the species
        name for the title, and so does the slug."""
        self.sign_in_visitor()
        body = self.sighting_body()
        body.pop('name')
        self.assertEqual(self.post(SIGHTING_URL, body).json()['slug'], 'venado-cola-blanca')

    def test_a_name_that_slugifies_to_nothing_still_gets_a_slug(self):
        self.sign_in_visitor()
        response = self.post(SPECIES_URL, self.species_body(name='キツネ'))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['slug'], 'species')


class ContributeAuthorTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    """The credit line: derived from the filing account, never stored."""

    def test_the_credit_line_is_the_contributors_first_name(self):
        self.sign_in_visitor()
        response = self.post(SIGHTING_URL, self.sighting_body())
        self.assertEqual(response.json()['author_name'], 'Elena')
        self.assertFalse(response.json()['author_anonymous'])

    def test_a_name_sent_by_a_contributor_is_ignored(self):
        """There is no writable credit line any more. A client that still sends
        one must not be able to publish a name that is not its account's - which
        is the whole reason the field was dropped rather than left as free text."""
        self.sign_in_visitor()
        response = self.post(SIGHTING_URL, self.sighting_body(author_name='Someone Else'))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['author_name'], 'Elena')
        self.assertFalse(hasattr(Sighting.objects.get(pk=response.json()['id']), 'author_name'))

    def test_anonymous_publishes_no_name(self):
        """Suppressed at render, which is safe here where blurring a sensitive
        coordinate at render time would not be: this does not vary by who is
        asking, so the one cached payload is right for every caller."""
        self.sign_in_visitor()
        response = self.post(SIGHTING_URL, self.sighting_body(author_anonymous=True))

        self.assertEqual(response.json()['author_name'], '')
        self.assertTrue(response.json()['author_anonymous'])
        # The account is still recorded - anonymity is about the credit line, not
        # about the audit trail.
        self.assertEqual(Sighting.objects.get(pk=response.json()['id']).created_by.username, 'visitor')

    def test_an_account_with_no_first_name_gets_no_credit_line(self):
        """`first_name` is optional at sign-up, so this is a real account, not a
        corner case. It reads exactly like an entry nobody was credited on."""
        self.make_visitor(username='quiet', first_name='')
        self.client.login(username='quiet', password='just-looking-2026')
        self.assertEqual(self.post(SIGHTING_URL, self.sighting_body()).json()['author_name'], '')

    def test_the_contributing_account_is_never_published(self):
        """A first name is published; the id, the email and the username are not."""
        self.sign_in_visitor()
        payload = self.post(SIGHTING_URL, self.sighting_body()).json()
        self.assertNotIn('created_by', payload)
        self.assertNotIn('visitor', json.dumps(payload))

    def test_an_administrator_may_honour_a_later_request_for_anonymity(self):
        """The name itself is not correctable here - it belongs to the account -
        but the contributor's answer to "credit me?" still is."""
        self.sign_in_visitor()
        pk = self.post(SIGHTING_URL, self.sighting_body()).json()['id']
        self.client.logout()

        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.patch(
            f'/api/journal/sightings/{pk}/',
            {'author_anonymous': True},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['author_name'], '')

    def test_a_cms_authored_entry_carries_no_credit_line(self):
        """Nothing files it, so `created_by` is null and there is nobody to
        credit - the deliberate trade for dropping the free-text field."""
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.post(
            '/api/journal/sightings/',
            {
                'species': self.species.pk,
                'name': 'Anotado en el CMS',
                'slug': 'anotado-en-el-cms',
                'date': '2026-05-14',
                'location': self.place.pk,
            },
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['author_name'], '')


class ContributeValidationTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    def test_a_sighting_needs_a_place_or_a_pin(self):
        self.sign_in_visitor()
        body = self.sighting_body()
        body.pop('location')
        self.assertEqual(self.post(SIGHTING_URL, body).status_code, 400)

    def test_a_pin_alone_is_enough(self):
        self.sign_in_visitor()
        body = self.sighting_body(latitude='20.612', longitude='-103.512')
        body.pop('location')
        self.assertEqual(self.post(SIGHTING_URL, body).status_code, 201)

    def test_half_a_coordinate_is_refused(self):
        self.sign_in_visitor()
        response = self.post(SIGHTING_URL, self.sighting_body(latitude='20.612'))
        self.assertEqual(response.status_code, 400)

    def test_an_encounter_cannot_be_in_the_future(self):
        self.sign_in_visitor()
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        response = self.post(SIGHTING_URL, self.sighting_body(date=tomorrow))
        self.assertEqual(response.status_code, 400)

    def test_a_disabled_category_may_not_be_filed_under(self):
        self.sign_in_visitor()
        self.category.enabled = False
        self.category.save(update_fields=['enabled'])
        self.assertEqual(self.post(SPECIES_URL, self.species_body()).status_code, 400)

    def test_a_pending_species_may_not_be_filed_against(self):
        """Otherwise an entry waits on a species that may never be approved - and
        `PROTECT` would then leave the sighting holding a row nobody can delete."""
        self.sign_in_visitor()
        pending = self.post(SPECIES_URL, self.species_body()).json()['id']
        response = self.post(SIGHTING_URL, self.sighting_body(species=pending))
        self.assertEqual(response.status_code, 400)

    def test_the_season_is_derived_rather_than_asked_for(self):
        from catalog.models import Season

        spring = Season.objects.create(name='Primavera', slug='primavera', months=[3, 4, 5])
        self.sign_in_visitor()
        response = self.post(SIGHTING_URL, self.sighting_body(date='2026-05-14'))
        self.assertEqual(Sighting.objects.get(pk=response.json()['id']).season, spring)

    def test_a_blank_name_is_refused_for_a_species(self):
        self.sign_in_visitor()
        self.assertEqual(self.post(SPECIES_URL, self.species_body(name='   ')).status_code, 400)

    def test_an_outbound_link_cannot_be_contributed(self):
        """`href` and `video_link` are absent from both contribute serializers:
        an arbitrary URL on a row anyone may create is link spam."""
        self.sign_in_visitor()
        species = self.post(
            SPECIES_URL,
            self.species_body(href='https://spam.example', video_link='https://spam.example'),
        ).json()
        self.assertIsNone(Species.objects.get(pk=species['id']).href)
        self.assertIsNone(Species.objects.get(pk=species['id']).video_link)

        sighting = self.post(
            SIGHTING_URL, self.sighting_body(href='https://spam.example')
        ).json()
        self.assertIsNone(Sighting.objects.get(pk=sighting['id']).href)


class ContributeLocationTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    """The third thing the public flow can create - and the one a *sighting* may
    depend on before anybody has reviewed it."""

    def test_a_contributed_place_lands_disabled_and_flagged(self):
        self.sign_in_visitor()
        row = Location.objects.get(pk=self.post(LOCATION_URL, self.location_body()).json()['id'])
        self.assertFalse(row.enabled)
        self.assertTrue(row.is_contribution)
        self.assertFalse(row.is_featured)
        self.assertEqual(row.sort_order, 0)
        self.assertEqual(row.created_by.username, 'visitor')

    def test_the_slug_is_derived_from_the_name(self):
        self.sign_in_visitor()
        first = self.post(LOCATION_URL, self.location_body())
        second = self.post(LOCATION_URL, self.location_body())
        self.assertEqual(first.json()['slug'], 'laguna-de-sayula')
        self.assertEqual(second.json()['slug'], 'laguna-de-sayula-2')

    def test_a_place_may_be_proposed_without_a_photograph(self):
        """Unlike a species. A pond is reviewable from its pin, and the flow adds
        places mid-sighting, where the contributor's photographs are of the
        animal rather than of the place."""
        self.sign_in_visitor()
        self.assertEqual(self.post(LOCATION_URL, self.location_body()).status_code, 201)

    def test_photographs_are_written_when_they_are_sent(self):
        self.sign_in_visitor()
        response = self.post(LOCATION_URL, self.location_body(photos=[base64_image()]))
        self.assertEqual(len(response.json()['images']), 1)

    def test_coordinates_are_required(self):
        """The one field the CMS leaves optional and this does not: a place with
        no pin is unmappable, and a sighting filed at it inherits nothing."""
        self.sign_in_visitor()
        for missing in ('latitude', 'longitude'):
            with self.subTest(missing=missing):
                body = self.location_body()
                body.pop(missing)
                self.assertEqual(self.post(LOCATION_URL, body).status_code, 400)

    def test_a_contributor_cannot_publish_feature_or_blur_a_place(self):
        """⚠ `hide_precise_location` is the one that is not merely editorial: it
        blurs this place's coordinates *and every sighting filed at it*, for every
        caller. It is absent from `Meta.fields`, so DRF drops it."""
        self.sign_in_visitor()
        response = self.post(
            LOCATION_URL,
            self.location_body(
                enabled=True, is_featured=True, sort_order=99, hide_precise_location=True
            ),
        )
        row = Location.objects.get(pk=response.json()['id'])
        self.assertFalse(row.enabled)
        self.assertFalse(row.is_featured)
        self.assertFalse(row.hide_precise_location)

    def test_a_slug_and_an_icon_cannot_be_contributed(self):
        self.sign_in_visitor()
        response = self.post(
            LOCATION_URL, self.location_body(slug='chosen-by-me', icon=base64_image())
        )
        row = Location.objects.get(pk=response.json()['id'])
        self.assertEqual(row.slug, 'laguna-de-sayula')
        self.assertFalse(row.icon)

    def test_a_pending_place_is_absent_from_the_public_list(self):
        self.sign_in_visitor()
        self.post(LOCATION_URL, self.location_body())
        self.client.logout()

        rows = self.client.get('/api/catalog/locations/').json()
        self.assertEqual([row['slug'] for row in rows], ['la-primavera'])

    def test_a_sighting_may_be_filed_at_a_place_that_is_still_pending(self):
        """The reason this endpoint exists at all: a contributor standing at an
        uncatalogued pond adds the pond and files the encounter in one sitting.
        Both rows are pending and a reviewer publishes the pair."""
        self.sign_in_visitor()
        place = self.post(LOCATION_URL, self.location_body()).json()['id']

        response = self.post(SIGHTING_URL, self.sighting_body(location=place))
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Sighting.objects.get(pk=response.json()['id']).location_id, place)

    def test_a_disabled_parent_or_county_is_refused(self):
        """A *parent* is different from the location a sighting points at: this
        place would hang inside a row that may never be published."""
        from catalog.models import Country, County, State

        self.sign_in_visitor()
        self.place.enabled = False
        self.place.save(update_fields=['enabled'])
        self.assertEqual(
            self.post(LOCATION_URL, self.location_body(parent=self.place.pk)).status_code, 400
        )

        country = Country.objects.create(name='México', slug='mexico', code='MX')
        state = State.objects.create(name='Jalisco', slug='jalisco', country=country)
        county = County.objects.create(
            name='Sayula', slug='sayula', state=state, enabled=False
        )
        self.assertEqual(
            self.post(LOCATION_URL, self.location_body(county=county.pk)).status_code, 400
        )

    def test_a_blank_name_is_refused(self):
        self.sign_in_visitor()
        self.assertEqual(self.post(LOCATION_URL, self.location_body(name='  ')).status_code, 400)

    def test_publishing_a_place_is_an_ordinary_admin_patch(self):
        self.sign_in_visitor()
        pk = self.post(LOCATION_URL, self.location_body()).json()['id']
        self.client.logout()

        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.patch(
            f'/api/catalog/locations/{pk}/', {'enabled': True}, content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)

        self.client.logout()
        rows = self.client.get('/api/catalog/locations/').json()
        self.assertIn('laguna-de-sayula', [row['slug'] for row in rows])


class ContributeVideoTests(ContributeFixtureMixin, IsolatedMediaTestCase):
    """Reserving a clip on an entry you filed.

    No file passes through this API - the row is created empty and the browser
    uploads to the handler in ``apps/animals``, which transcodes and reports back.
    What is under test here is the narrowing: whose entry, how many, how long.
    """

    def video_url(self, sighting_id):
        return f'/api/journal/sightings/{sighting_id}/media/video/contribute/'

    def file_a_sighting(self):
        return self.post(SIGHTING_URL, self.sighting_body()).json()['id']

    def reserve(self, sighting_id, **overrides):
        body = {'filename': 'fawn.mp4', 'size_bytes': 40_000_000, 'duration_seconds': 30}
        return self.post(self.video_url(sighting_id), {**body, **overrides})

    def test_a_contributor_may_reserve_a_clip_on_their_own_pending_entry(self):
        self.sign_in_visitor()
        sighting_id = self.file_a_sighting()
        response = self.reserve(sighting_id)
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body['kind'], 'video')
        self.assertEqual(body['processing_status'], 'pending')

    def test_a_contributor_cannot_reserve_a_clip_on_someone_elses_entry(self):
        self.sign_in_visitor()
        sighting_id = self.file_a_sighting()
        self.client.logout()

        self.make_visitor(username='someone-else')
        self.client.login(username='someone-else', password='just-looking-2026')
        # 404, not 403: whether that pk exists is not this caller's business.
        self.assertEqual(self.reserve(sighting_id).status_code, 404)

    def test_a_contributor_cannot_reserve_a_clip_on_a_published_entry(self):
        """Once a reviewer has approved the entry, adding media to it is authoring."""
        self.sign_in_visitor()
        sighting_id = self.file_a_sighting()
        Sighting.objects.filter(pk=sighting_id).update(enabled=True)
        self.assertEqual(self.reserve(sighting_id).status_code, 404)

    def test_one_clip_per_entry(self):
        self.sign_in_visitor()
        sighting_id = self.file_a_sighting()
        self.assertEqual(self.reserve(sighting_id).status_code, 201)
        self.assertEqual(self.reserve(sighting_id).status_code, 409)

    def test_an_over_long_clip_is_refused(self):
        self.sign_in_visitor()
        sighting_id = self.file_a_sighting()
        with self.settings(MAX_CONTRIBUTION_VIDEO_SECONDS=90):
            response = self.reserve(sighting_id, duration_seconds=240)
        self.assertEqual(response.status_code, 400)
        self.assertIn('duration_seconds', response.json())

    def test_the_daily_quota_is_admission_control_on_the_transcode_queue(self):
        self.sign_in_visitor()
        with self.settings(MAX_CONTRIBUTION_VIDEOS_PER_DAY=2):
            for _ in range(2):
                self.assertEqual(self.reserve(self.file_a_sighting()).status_code, 201)
            self.assertEqual(self.reserve(self.file_a_sighting()).status_code, 429)

    def test_the_cms_endpoint_stays_admin_only(self):
        """The contributor route is a sibling, never a relaxed permission.

        The same argument as `test_the_ordinary_write_endpoints_are_still_admin_only`
        above: widening the admin endpoint would widen every clip on every entry.
        """
        self.sign_in_visitor()
        sighting_id = self.file_a_sighting()
        response = self.post(
            f'/api/journal/sightings/{sighting_id}/media/video/',
            {'filename': 'fawn.mp4', 'size_bytes': 40_000_000},
        )
        self.assertIn(response.status_code, (401, 403))

    def test_the_reserve_response_carries_a_signed_upload_ticket(self):
        """The handler has no way of its own to know who may write a row.

        It could ask this API, but the answer turns on `created_by`, which the
        read payload deliberately does not publish. The ticket carries the
        decision these endpoints already made.
        """
        self.sign_in_visitor()
        with self.settings(VIDEO_HANDLER_TOKEN='secret'):
            body = self.reserve(self.file_a_sighting()).json()
        self.assertIn('.', body['upload_ticket'])

    def test_no_ticket_is_issued_without_a_configured_secret(self):
        """Video stops working rather than working unauthorised."""
        self.sign_in_visitor()
        with self.settings(VIDEO_HANDLER_TOKEN=''):
            body = self.reserve(self.file_a_sighting()).json()
        self.assertEqual(body['upload_ticket'], '')

    def test_a_ticket_never_appears_on_an_ordinary_gallery_read(self):
        """It is a capability, not a field - a public read must not carry one."""
        self.sign_in_visitor()
        sighting_id = self.file_a_sighting()
        with self.settings(VIDEO_HANDLER_TOKEN='secret'):
            self.reserve(sighting_id)
        rows = self.client.get(f'/api/journal/sightings/{sighting_id}/media/').json()
        self.assertTrue(rows)
        for row in rows:
            self.assertNotIn('upload_ticket', row)
