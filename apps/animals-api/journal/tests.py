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
