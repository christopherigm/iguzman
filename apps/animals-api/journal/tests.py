from datetime import date

from django.core.files.uploadedfile import SimpleUploadedFile

from catalog.models import Category, Location, Season, Species, WeatherCondition
from core.tests import IsolatedMediaTestCase, base64_image

from .models import Sighting, SightingMedia


class JournalFixtureMixin:
    def make_species(self, **kwargs):
        category = Category.objects.create(name='Deer', slug='deer', kind='animal')
        defaults = {'name': 'White-tailed Deer', 'slug': 'white-tailed-deer'}
        return Species.objects.create(category=category, **{**defaults, **kwargs})

    def make_sighting(self, species=None, **kwargs):
        defaults = {'slug': 'first-fawn', 'date': date(2026, 10, 14)}
        return Sighting.objects.create(
            species=species or self.make_species(), **{**defaults, **kwargs}
        )

    def sign_in_staff(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')


class SeasonAutoFillTests(JournalFixtureMixin, IsolatedMediaTestCase):
    def setUp(self):
        super().setUp()
        self.autumn = Season.objects.create(name='Autumn', slug='autumn', months=[9, 10, 11])
        self.winter = Season.objects.create(name='Winter', slug='winter', months=[12, 1, 2])

    def test_a_blank_season_is_filled_from_the_date(self):
        sighting = self.make_sighting()
        self.assertEqual(sighting.season, self.autumn)

    def test_an_explicit_season_is_never_overwritten(self):
        """An unseasonably warm November day stays filed where the author put it."""
        sighting = self.make_sighting(season=self.winter)
        self.assertEqual(sighting.season, self.winter)

        sighting.short_description = 'Still winter, as far as the deer were concerned.'
        sighting.save()
        sighting.refresh_from_db()
        self.assertEqual(sighting.season, self.winter)

    def test_no_matching_season_leaves_it_blank(self):
        sighting = self.make_sighting(date=date(2026, 6, 1))
        self.assertIsNone(sighting.season)


class SightingApiTests(JournalFixtureMixin, IsolatedMediaTestCase):
    def test_the_feed_is_paginated(self):
        species = self.make_species()
        for i in range(5):
            Sighting.objects.create(species=species, slug=f'entry-{i}', date=date(2026, 10, i + 1))

        payload = self.client.get('/api/journal/sightings/?limit=2').json()
        self.assertEqual(payload['count'], 5)
        self.assertEqual(payload['limit'], 2)
        self.assertEqual(payload['offset'], 0)
        self.assertEqual(len(payload['results']), 2)
        # Newest first.
        self.assertEqual(payload['results'][0]['slug'], 'entry-4')

        page_two = self.client.get('/api/journal/sightings/?limit=2&offset=2').json()
        self.assertEqual([r['slug'] for r in page_two['results']], ['entry-2', 'entry-1'])

    def test_the_page_size_is_capped(self):
        self.make_sighting()
        payload = self.client.get('/api/journal/sightings/?limit=100000').json()
        self.assertEqual(payload['limit'], 100)

    def test_a_feed_card_carries_its_species_and_branch(self):
        self.make_sighting()
        row = self.client.get('/api/journal/sightings/').json()['results'][0]
        self.assertEqual(row['species_name'], 'White-tailed Deer')
        self.assertEqual(row['species_slug'], 'white-tailed-deer')
        self.assertEqual(row['kind'], 'animal')
        self.assertEqual(row['category_slug'], 'deer')

    def test_filters(self):
        species = self.make_species()
        other = Species.objects.create(
            category=Category.objects.create(name='Oaks', slug='oaks', kind='plant'),
            name='Coast Live Oak', slug='coast-live-oak',
        )
        park = Location.objects.create(name='Big Park', slug='big-park')
        trail = Location.objects.create(name='Ridge Trail', slug='ridge-trail', parent=park)
        Sighting.objects.create(species=species, slug='deer-1', date=date(2026, 10, 14), location=trail)
        Sighting.objects.create(species=other, slug='oak-1', date=date(2025, 4, 2))

        def slugs(query):
            return [r['slug'] for r in self.client.get(f'/api/journal/sightings/{query}').json()['results']]

        self.assertEqual(slugs('?kind=plant'), ['oak-1'])
        self.assertEqual(slugs('?species_slug=white-tailed-deer'), ['deer-1'])
        self.assertEqual(slugs('?year=2025'), ['oak-1'])
        self.assertEqual(slugs('?date_from=2026-01-01'), ['deer-1'])
        # A park's feed includes what was seen on the trails inside it.
        self.assertEqual(slugs('?location_slug=big-park'), ['deer-1'])
        self.assertEqual(slugs('?location_slug=ridge-trail'), ['deer-1'])

    def test_writes_require_staff(self):
        species = self.make_species()
        body = {'species': species.pk, 'slug': 'new-entry', 'date': '2026-10-14'}
        response = self.client.post('/api/journal/sightings/', body, content_type='application/json')
        self.assertIn(response.status_code, (401, 403))

        self.sign_in_staff()
        response = self.client.post('/api/journal/sightings/', body, content_type='application/json')
        self.assertEqual(response.status_code, 201, response.content)

    def test_coordinates_must_be_set_together(self):
        self.sign_in_staff()
        species = self.make_species()
        response = self.client.post(
            '/api/journal/sightings/',
            {'species': species.pk, 'slug': 'half-coords', 'date': '2026-10-14', 'latitude': '37.4'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_stats(self):
        self.make_sighting()
        payload = self.client.get('/api/journal/stats/').json()
        self.assertEqual(payload['sighting_count'], 1)
        self.assertEqual(payload['species_count'], 1)
        self.assertEqual(payload['first_sighting_date'], '2026-10-14')
        by_kind = {row['kind']: row['count'] for row in payload['sightings_by_kind']}
        self.assertEqual(by_kind['animal'], 1)
        self.assertEqual(by_kind['fungus'], 0)


class CoordinateTests(JournalFixtureMixin, IsolatedMediaTestCase):
    def test_coordinates_fall_back_to_the_location(self):
        location = Location.objects.create(
            name='Oak Hollow', slug='oak-hollow',
            latitude='37.428193', longitude='-122.143219',
        )
        self.make_sighting(location=location)
        payload = self.client.get('/api/journal/sightings/slug/first-fawn/').json()
        self.assertEqual(payload['latitude'], 37.428193)
        self.assertFalse(payload['coordinates_are_approximate'])

    def test_the_sightings_own_coordinates_win(self):
        location = Location.objects.create(
            name='Oak Hollow', slug='oak-hollow',
            latitude='37.428193', longitude='-122.143219',
        )
        self.make_sighting(location=location, latitude='37.500000', longitude='-122.200000')
        payload = self.client.get('/api/journal/sightings/slug/first-fawn/').json()
        self.assertEqual(payload['latitude'], 37.5)

    def test_a_sensitive_location_blurs_the_sightings_coordinates(self):
        location = Location.objects.create(
            name='Heron Nest', slug='heron-nest',
            latitude='37.428193', longitude='-122.143219',
            hide_precise_location=True,
        )
        self.make_sighting(location=location, latitude='37.512345', longitude='-122.298765')
        payload = self.client.get('/api/journal/sightings/slug/first-fawn/').json()
        self.assertEqual(payload['latitude'], 37.51)
        self.assertEqual(payload['longitude'], -122.3)
        self.assertTrue(payload['coordinates_are_approximate'])


class MapTests(JournalFixtureMixin, IsolatedMediaTestCase):
    """`/api/journal/sightings/map/` - the pins a public map draws."""

    def make_located_species(self, category_slug, species_slug, **kwargs):
        category = Category.objects.create(
            name=category_slug.title(), slug=category_slug, kind='animal', **kwargs
        )
        return Species.objects.create(
            category=category, name=species_slug.title(), slug=species_slug
        )

    def test_only_entries_that_can_be_pinned_are_returned(self):
        """A sighting with no coordinates of its own *and* no located place is not a pin."""
        species = self.make_species()
        located = Location.objects.create(
            name='Oak Hollow', slug='oak-hollow',
            latitude='37.428193', longitude='-122.143219',
        )
        nowhere = Location.objects.create(name='Unknown', slug='unknown')

        Sighting.objects.create(species=species, slug='own-coords', date=date(2026, 10, 1),
                                latitude='37.5', longitude='-122.2')
        Sighting.objects.create(species=species, slug='via-location', date=date(2026, 10, 2),
                                location=located)
        Sighting.objects.create(species=species, slug='unlocated', date=date(2026, 10, 3),
                                location=nowhere)
        Sighting.objects.create(species=species, slug='no-place', date=date(2026, 10, 4))

        pins = self.client.get('/api/journal/sightings/map/').json()
        self.assertEqual({pin['slug'] for pin in pins}, {'own-coords', 'via-location'})
        # Newest first, like the feed it is drawn from.
        self.assertEqual([pin['slug'] for pin in pins], ['via-location', 'own-coords'])

    def test_a_pin_carries_the_species_icon_and_its_categorys(self):
        """What the marker is drawn as - the reason this is not the feed serializer."""
        species = self.make_species()
        species.icon.save('icon.png', SimpleUploadedFile('icon.png', b'not-a-real-png'), save=True)
        category = species.category
        category.icon.save('cat.png', SimpleUploadedFile('cat.png', b'not-a-real-png'), save=True)

        Sighting.objects.create(species=species, slug='pinned', date=date(2026, 10, 1),
                                latitude='37.5', longitude='-122.2')

        pin = self.client.get('/api/journal/sightings/map/').json()[0]
        # The upload path randomizes the filename, so the *directory* is what
        # says which record's glyph came back.
        self.assertIn('/species/', pin['species_icon'])
        self.assertIn('/category/', pin['category_icon'])
        self.assertEqual(pin['species_slug'], species.slug)
        self.assertEqual(pin['category_slug'], category.slug)
        # Never the gallery: a photograph cropped into a 28 px circle is not a mark.
        self.assertNotIn('media', pin)

    def test_a_detail_payload_carries_the_same_marker_glyphs(self):
        """An entry's own page pins itself, and dresses that pin from this payload.

        Without these three the sighting page would have to re-read the whole map
        endpoint to draw the one marker it already has the coordinates for.
        """
        species = self.make_species()
        species.icon.save('icon.png', SimpleUploadedFile('icon.png', b'not-a-real-png'), save=True)
        category = species.category
        category.icon.save('cat.png', SimpleUploadedFile('cat.png', b'not-a-real-png'), save=True)
        category.background_color = '#123456'
        category.save()

        Sighting.objects.create(species=species, slug='pinned', date=date(2026, 10, 1),
                                latitude='37.5', longitude='-122.2')

        entry = self.client.get('/api/journal/sightings/slug/pinned/').json()
        self.assertIn('/species/', entry['species_icon'])
        self.assertIn('/category/', entry['category_icon'])
        self.assertEqual(entry['category_color'], '#123456')

    def test_a_sensitive_location_blurs_a_pin_too(self):
        """The map may not be the one surface that publishes the precise nest."""
        location = Location.objects.create(
            name='Heron Nest', slug='heron-nest',
            latitude='37.428193', longitude='-122.143219',
            hide_precise_location=True,
        )
        self.make_sighting(location=location, latitude='37.512345', longitude='-122.298765')

        pin = self.client.get('/api/journal/sightings/map/').json()[0]
        self.assertEqual(pin['latitude'], 37.51)
        self.assertEqual(pin['longitude'], -122.3)
        self.assertTrue(pin['coordinates_are_approximate'])

    def test_category_slug_returns_every_pin_of_that_branch(self):
        """A category page's map is 'all the places', not a page of them."""
        deer = self.make_located_species('deer', 'white-tailed-deer')
        hawks = self.make_located_species('hawks', 'red-tailed-hawk')
        for i in range(12):
            Sighting.objects.create(species=deer, slug=f'deer-{i}', date=date(2026, 10, 1),
                                    latitude='37.5', longitude='-122.2')
        Sighting.objects.create(species=hawks, slug='hawk-0', date=date(2026, 10, 1),
                                latitude='37.6', longitude='-122.3')

        pins = self.client.get('/api/journal/sightings/map/?category_slug=deer').json()
        self.assertEqual(len(pins), 12)
        self.assertTrue(all(pin['category_slug'] == 'deer' for pin in pins))

    def test_per_category_takes_the_latest_n_of_each_branch(self):
        """One prolific category may not crowd every other off the landing map."""
        deer = self.make_located_species('deer', 'white-tailed-deer')
        hawks = self.make_located_species('hawks', 'red-tailed-hawk')
        for i in range(8):
            Sighting.objects.create(species=deer, slug=f'deer-{i}', date=date(2026, 10, i + 1),
                                    latitude='37.5', longitude='-122.2')
        for i in range(4):
            Sighting.objects.create(species=hawks, slug=f'hawk-{i}', date=date(2026, 9, i + 1),
                                    latitude='37.6', longitude='-122.3')

        pins = self.client.get('/api/journal/sightings/map/?per_category=3').json()
        by_category = {}
        for pin in pins:
            by_category.setdefault(pin['category_slug'], []).append(pin['slug'])

        self.assertEqual(len(by_category['deer']), 3)
        self.assertEqual(len(by_category['hawks']), 3)
        # The *latest* three, even though every hawk entry is older than every deer one.
        self.assertEqual(by_category['deer'], ['deer-7', 'deer-6', 'deer-5'])

    def test_a_disabled_entry_is_not_pinned_for_the_public(self):
        species = self.make_species()
        Sighting.objects.create(species=species, slug='draft', date=date(2026, 10, 1),
                                latitude='37.5', longitude='-122.2', enabled=False)
        Sighting.objects.create(species=species, slug='published', date=date(2026, 10, 2),
                                latitude='37.6', longitude='-122.3')

        pins = self.client.get('/api/journal/sightings/map/').json()
        self.assertEqual([pin['slug'] for pin in pins], ['published'])

        # ...and the public response was not what the CMS's own read replayed.
        self.sign_in_staff()
        pins = self.client.get('/api/journal/sightings/map/?include_disabled=true').json()
        self.assertEqual({pin['slug'] for pin in pins}, {'draft', 'published'})

    def test_a_new_sighting_clears_the_cached_pins(self):
        species = self.make_species()
        Sighting.objects.create(species=species, slug='first', date=date(2026, 10, 1),
                                latitude='37.5', longitude='-122.2')
        self.assertEqual(len(self.client.get('/api/journal/sightings/map/').json()), 1)

        Sighting.objects.create(species=species, slug='second', date=date(2026, 10, 2),
                                latitude='37.6', longitude='-122.3')
        self.assertEqual(len(self.client.get('/api/journal/sightings/map/').json()), 2)

    def test_a_species_icon_upload_clears_the_cached_pins(self):
        """The icon lives two tables away from the row a pin is built from."""
        species = self.make_species()
        Sighting.objects.create(species=species, slug='pinned', date=date(2026, 10, 1),
                                latitude='37.5', longitude='-122.2')
        self.assertIsNone(self.client.get('/api/journal/sightings/map/').json()[0]['species_icon'])

        species.icon.save('icon.png', SimpleUploadedFile('icon.png', b'not-a-real-png'), save=True)
        self.assertIsNotNone(
            self.client.get('/api/journal/sightings/map/').json()[0]['species_icon']
        )


class MediaTests(JournalFixtureMixin, IsolatedMediaTestCase):
    def setUp(self):
        super().setUp()
        self.sighting = self.make_sighting()
        self.media_url = f'/api/journal/sightings/{self.sighting.pk}/media/'

    def test_adding_a_photo(self):
        self.sign_in_staff()
        response = self.client.post(
            self.media_url,
            {'kind': 'image', 'image': base64_image(), 'name': 'Doe at the treeline'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body['kind'], 'image')
        self.assertTrue(body['image'])
        self.assertEqual(body['source_url'], body['image'])

    def test_adding_a_video_link(self):
        self.sign_in_staff()
        response = self.client.post(
            self.media_url,
            {'kind': 'link', 'url': 'https://youtube.com/watch?v=abc123', 'poster': base64_image()},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body['source_url'], 'https://youtube.com/watch?v=abc123')
        self.assertTrue(body['poster'])

    def test_each_kind_requires_its_own_payload(self):
        self.sign_in_staff()
        for body, missing in (
            ({'kind': 'image'}, 'image'),
            ({'kind': 'link'}, 'url'),
        ):
            with self.subTest(kind=body['kind']):
                response = self.client.post(self.media_url, body, content_type='application/json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(missing, response.json())

    def test_a_video_file_cannot_be_posted_as_json(self):
        """The JSON endpoint only knows image and link - a file needs multipart."""
        self.sign_in_staff()
        response = self.client.post(
            self.media_url, {'kind': 'video'}, content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_uploading_a_video_file(self):
        self.sign_in_staff()
        upload = SimpleUploadedFile('fawn.mp4', b'\x00\x00\x00 ftypisom fake', content_type='video/mp4')
        response = self.client.post(
            f'{self.media_url}video/', {'file': upload, 'duration_seconds': 12}
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body['kind'], 'video')
        self.assertTrue(body['file'])
        self.assertEqual(body['source_url'], body['file'])

    def test_an_unplayable_container_is_rejected(self):
        self.sign_in_staff()
        upload = SimpleUploadedFile('fawn.avi', b'fake', content_type='video/x-msvideo')
        response = self.client.post(f'{self.media_url}video/', {'file': upload})
        self.assertEqual(response.status_code, 400)
        self.assertIn('file', response.json())

    def test_an_oversized_video_is_rejected(self):
        self.sign_in_staff()
        with self.settings(MAX_VIDEO_UPLOAD_MB=1):
            upload = SimpleUploadedFile('big.mp4', b'x' * (2 * 1024 * 1024), content_type='video/mp4')
            response = self.client.post(f'{self.media_url}video/', {'file': upload})
        self.assertEqual(response.status_code, 400)

    def test_media_is_staff_only(self):
        response = self.client.post(
            self.media_url, {'kind': 'image', 'image': base64_image()},
            content_type='application/json',
        )
        self.assertIn(response.status_code, (401, 403))

    def test_the_gallery_appears_on_the_sighting_and_updates_its_cover(self):
        self.sign_in_staff()
        # Cached with no media first, so this also covers the invalidation.
        self.assertIsNone(self.client.get('/api/journal/sightings/slug/first-fawn/').json()['image'])

        self.client.post(
            self.media_url, {'kind': 'image', 'image': base64_image()},
            content_type='application/json',
        )
        payload = self.client.get('/api/journal/sightings/slug/first-fawn/').json()
        self.assertEqual(payload['media_count'], 1)
        # With no cover of its own, the entry falls back to its first photo.
        self.assertTrue(payload['image'])

    def test_deleting_media(self):
        self.sign_in_staff()
        created = self.client.post(
            self.media_url, {'kind': 'image', 'image': base64_image()},
            content_type='application/json',
        ).json()
        response = self.client.delete(f'{self.media_url}{created["id"]}/')
        self.assertEqual(response.status_code, 204)
        self.assertEqual(SightingMedia.objects.count(), 0)


class ProtectedDeleteTests(JournalFixtureMixin, IsolatedMediaTestCase):
    def test_a_species_with_sightings_cannot_be_deleted(self):
        self.sign_in_staff()
        sighting = self.make_sighting()
        response = self.client.delete(f'/api/catalog/species/{sighting.species_id}/')
        self.assertEqual(response.status_code, 409)
        self.assertTrue(Species.objects.filter(pk=sighting.species_id).exists())

    def test_a_category_with_species_cannot_be_deleted(self):
        self.sign_in_staff()
        species = self.make_species()
        response = self.client.delete(f'/api/catalog/categories/{species.category_id}/')
        self.assertEqual(response.status_code, 409)

    def test_deleting_a_location_leaves_its_sightings(self):
        """SET_NULL, unlike species: a place can be merged away without taking
        the entries filed there with it."""
        self.sign_in_staff()
        location = Location.objects.create(name='Oak Hollow', slug='oak-hollow')
        sighting = self.make_sighting(location=location)

        response = self.client.delete(f'/api/catalog/locations/{location.pk}/')
        self.assertEqual(response.status_code, 204)
        sighting.refresh_from_db()
        self.assertIsNone(sighting.location)


class AdminPathCacheInvalidationTests(JournalFixtureMixin, IsolatedMediaTestCase):
    """The journal half of ``catalog.tests.AdminPathCacheInvalidationTests``.

    An outing is typed up in the Django admin, so the write that has to reach the
    feed's cache is a plain ``Sighting.save()`` - no view involved. The feed is
    the one list here that always carries query params in practice, so the two
    URLs below check the paginated shape *and* the bare key.
    """

    def _feed(self):
        return self.client.get('/api/journal/sightings/').json()['results']

    def test_a_sighting_saved_in_the_admin_appears_in_the_feed(self):
        species = self.make_species()
        self.assertEqual(self._feed(), [])

        Sighting.objects.create(species=species, slug='first-fawn', date=date(2026, 10, 14))

        self.assertEqual(len(self._feed()), 1)

    def test_a_sighting_saved_in_the_admin_refreshes_the_stats(self):
        self.assertEqual(self.client.get('/api/journal/stats/').json()['sighting_count'], 0)
        self.make_sighting()
        self.assertEqual(self.client.get('/api/journal/stats/').json()['sighting_count'], 1)

    def test_media_added_in_the_admin_refreshes_the_sighting_payload(self):
        """The admin edits a gallery through an inline, which saves the row directly."""
        sighting = self.make_sighting()
        detail = f'/api/journal/sightings/{sighting.pk}/'
        self.assertEqual(self.client.get(detail).json()['media'], [])

        SightingMedia.objects.create(
            sighting=sighting, kind='link', url='https://youtu.be/abc123'
        )

        self.assertEqual(len(self.client.get(detail).json()['media']), 1)


class ReferenceCountTests(JournalFixtureMixin, IsolatedMediaTestCase):
    def test_a_new_sighting_updates_the_cached_species_and_season_counts(self):
        self.sign_in_staff()
        season = Season.objects.create(name='Autumn', slug='autumn', months=[9, 10, 11])
        WeatherCondition.objects.create(name='Fog', slug='fog')
        species = self.make_species()

        self.assertEqual(self.client.get(f'/api/catalog/species/{species.pk}/').json()['sighting_count'], 0)
        self.assertEqual(self.client.get('/api/catalog/seasons/').json()[0]['sighting_count'], 0)

        response = self.client.post(
            '/api/journal/sightings/',
            {'species': species.pk, 'slug': 'first-fawn', 'date': '2026-10-14'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)

        payload = self.client.get(f'/api/catalog/species/{species.pk}/').json()
        self.assertEqual(payload['sighting_count'], 1)
        self.assertEqual(payload['last_seen'], '2026-10-14')
        # The season was filled from the date, so its count moved too.
        self.assertEqual(self.client.get('/api/catalog/seasons/').json()[0]['sighting_count'], 1)
        self.assertEqual(Sighting.objects.get(slug='first-fawn').season, season)
