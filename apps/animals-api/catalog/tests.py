from datetime import date

from core.tests import IsolatedMediaTestCase, base64_image, data_url

from .models import Category, Location, Season, Species, WeatherCondition


class CatalogFixtureMixin:
    def make_category(self, **kwargs):
        defaults = {'name': 'Deer', 'slug': 'deer', 'kind': 'animal'}
        return Category.objects.create(**{**defaults, **kwargs})

    def make_species(self, category=None, **kwargs):
        defaults = {'name': 'White-tailed Deer', 'slug': 'white-tailed-deer'}
        return Species.objects.create(
            category=category or self.make_category(), **{**defaults, **kwargs}
        )


class PermissionTests(CatalogFixtureMixin, IsolatedMediaTestCase):
    """GET is public; every write needs a staff account."""

    def test_anonymous_may_read(self):
        self.make_species()
        for url in ('/api/catalog/categories/', '/api/catalog/species/', '/api/catalog/kinds/'):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 200)

    def test_anonymous_may_not_write(self):
        response = self.client.post(
            '/api/catalog/categories/',
            {'name': 'Squirrels', 'slug': 'squirrels', 'kind': 'animal'},
            content_type='application/json',
        )
        self.assertIn(response.status_code, (401, 403))
        self.assertFalse(Category.objects.filter(slug='squirrels').exists())

    def test_signed_in_non_staff_may_not_write(self):
        self.make_visitor()
        self.client.login(username='visitor', password='just-looking-2026')
        response = self.client.post(
            '/api/catalog/categories/',
            {'name': 'Squirrels', 'slug': 'squirrels', 'kind': 'animal'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)

    def test_staff_may_write(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        response = self.client.post(
            '/api/catalog/categories/',
            {'name': 'Squirrels', 'slug': 'squirrels', 'kind': 'animal'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Category.objects.filter(slug='squirrels').exists())

    def test_disabled_rows_are_hidden_from_the_public(self):
        self.make_category(name='Owls', slug='owls', enabled=False)
        response = self.client.get('/api/catalog/categories/')
        self.assertEqual(response.json(), [])

    def test_include_disabled_is_ignored_for_anonymous_callers(self):
        """The param alone must never be enough - see core.permissions.show_disabled."""
        self.make_category(name='Owls', slug='owls', enabled=False)
        response = self.client.get('/api/catalog/categories/?include_disabled=true')
        self.assertEqual(response.json(), [])

        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        response = self.client.get('/api/catalog/categories/?include_disabled=true')
        self.assertEqual(len(response.json()), 1)

    def test_a_staff_response_is_not_replayed_to_the_public(self):
        """The regression the cache key exists to prevent: a staff list containing
        drafts must not be served from cache to the next anonymous caller."""
        self.make_category(name='Owls', slug='owls', enabled=False)
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        self.assertEqual(len(self.client.get('/api/catalog/categories/?include_disabled=true').json()), 1)

        self.client.logout()
        self.assertEqual(self.client.get('/api/catalog/categories/?include_disabled=true').json(), [])


class KindTests(CatalogFixtureMixin, IsolatedMediaTestCase):
    def test_kinds_lists_all_five_branches_with_counts(self):
        self.make_species()
        Category.objects.create(name='Oaks', slug='oaks', kind='plant')

        payload = self.client.get('/api/catalog/kinds/').json()
        self.assertEqual([row['value'] for row in payload],
                         ['animal', 'plant', 'fungus', 'season', 'weather'])
        by_kind = {row['value']: row for row in payload}
        self.assertEqual(by_kind['animal']['category_count'], 1)
        self.assertEqual(by_kind['animal']['species_count'], 1)
        self.assertEqual(by_kind['plant']['category_count'], 1)
        self.assertEqual(by_kind['plant']['species_count'], 0)
        self.assertEqual(by_kind['fungus']['category_count'], 0)

    def test_species_carries_its_branch_through_its_category(self):
        species = self.make_species()
        payload = self.client.get(f'/api/catalog/species/{species.pk}/').json()
        self.assertEqual(payload['kind'], 'animal')
        self.assertEqual(payload['category_slug'], 'deer')


class FilterTests(CatalogFixtureMixin, IsolatedMediaTestCase):
    def setUp(self):
        super().setUp()
        self.deer = self.make_category()
        self.oaks = Category.objects.create(name='Oaks', slug='oaks', kind='plant')
        self.make_species(category=self.deer)
        Species.objects.create(category=self.oaks, name='Coast Live Oak', slug='coast-live-oak')

    def test_species_filter_by_kind(self):
        payload = self.client.get('/api/catalog/species/?kind=plant').json()
        self.assertEqual([row['slug'] for row in payload], ['coast-live-oak'])

    def test_species_filter_by_category_slug(self):
        payload = self.client.get('/api/catalog/species/?category_slug=deer').json()
        self.assertEqual([row['slug'] for row in payload], ['white-tailed-deer'])

    def test_species_search_matches_scientific_name(self):
        Species.objects.filter(slug='coast-live-oak').update(scientific_name='Quercus agrifolia')
        payload = self.client.get('/api/catalog/species/?search=quercus').json()
        self.assertEqual([row['slug'] for row in payload], ['coast-live-oak'])


class SlugRouteTests(CatalogFixtureMixin, IsolatedMediaTestCase):
    def test_every_resource_is_reachable_by_slug(self):
        self.make_species()
        Season.objects.create(name='Autumn', slug='autumn', months=[9, 10, 11])
        WeatherCondition.objects.create(name='Fog', slug='fog')
        Location.objects.create(name='Oak Hollow', slug='oak-hollow')

        for url, expected in (
            ('/api/catalog/categories/slug/deer/', 'Deer'),
            ('/api/catalog/species/slug/white-tailed-deer/', 'White-tailed Deer'),
            ('/api/catalog/seasons/slug/autumn/', 'Autumn'),
            ('/api/catalog/weather-conditions/slug/fog/', 'Fog'),
            ('/api/catalog/locations/slug/oak-hollow/', 'Oak Hollow'),
        ):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['name'], expected)

    def test_a_draft_is_404_by_slug_for_the_public(self):
        self.make_category(name='Owls', slug='owls', enabled=False)
        self.assertEqual(self.client.get('/api/catalog/categories/slug/owls/').status_code, 404)


class ImageUploadTests(CatalogFixtureMixin, IsolatedMediaTestCase):
    def setUp(self):
        super().setUp()
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

    def test_base64_image_and_icon_are_stored(self):
        response = self.client.post(
            '/api/catalog/categories/',
            {
                'name': 'Squirrels', 'slug': 'squirrels', 'kind': 'animal',
                'image': data_url((800, 600)),
                'icon': base64_image((256, 256), fmt='PNG'),
            },
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)

        category = Category.objects.get(slug='squirrels')
        self.assertTrue(category.image)
        self.assertTrue(category.icon)
        # A PNG upload keeps its own format (transparency survives); the JPEG
        # data URL does not become a PNG.
        self.assertTrue(category.icon.name.endswith('.png'))
        self.assertTrue(category.image.name.endswith('.jpg'))

    def test_an_invalid_image_is_a_400_not_a_500(self):
        response = self.client.post(
            '/api/catalog/categories/',
            {'name': 'Bad', 'slug': 'bad', 'kind': 'animal', 'image': 'not-an-image'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('image', response.json())

    def test_patching_a_text_field_leaves_the_image_alone(self):
        category = self.make_category()
        self.client.post(
            f'/api/catalog/categories/{category.pk}/',
            {'image': base64_image()},
            content_type='application/json',
        )
        self.client.patch(
            f'/api/catalog/categories/{category.pk}/',
            {'image': base64_image()},
            content_type='application/json',
        )
        category.refresh_from_db()
        stored = category.image.name

        self.client.patch(
            f'/api/catalog/categories/{category.pk}/',
            {'short_description': 'All the deer.'},
            content_type='application/json',
        )
        category.refresh_from_db()
        self.assertEqual(category.image.name, stored)
        self.assertEqual(category.short_description, 'All the deer.')

    def test_an_explicit_empty_value_clears_the_image(self):
        category = self.make_category()
        self.client.patch(
            f'/api/catalog/categories/{category.pk}/',
            {'image': base64_image()},
            content_type='application/json',
        )
        self.client.patch(
            f'/api/catalog/categories/{category.pk}/',
            {'image': ''},
            content_type='application/json',
        )
        category.refresh_from_db()
        self.assertFalse(category.image)

    def test_species_gallery_upload(self):
        species = self.make_species()
        response = self.client.post(
            f'/api/catalog/species/{species.pk}/images/',
            {'image': base64_image(), 'name': 'Winter coat', 'sort_order': 0},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)

        payload = self.client.get(f'/api/catalog/species/{species.pk}/').json()
        self.assertEqual(len(payload['images']), 1)
        self.assertEqual(payload['images'][0]['name'], 'Winter coat')


class SeasonTests(IsolatedMediaTestCase):
    def test_for_date_matches_on_months(self):
        autumn = Season.objects.create(name='Autumn', slug='autumn', months=[9, 10, 11])
        Season.objects.create(name='Winter', slug='winter', months=[12, 1, 2])

        self.assertEqual(Season.for_date(date(2026, 10, 14)), autumn)
        self.assertIsNone(Season.for_date(date(2026, 6, 1)))
        self.assertIsNone(Season.for_date(None))

    def test_a_disabled_season_is_never_matched(self):
        Season.objects.create(name='Autumn', slug='autumn', months=[9, 10, 11], enabled=False)
        self.assertIsNone(Season.for_date(date(2026, 10, 14)))

    def test_the_api_rejects_a_bad_months_list(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        for months in ([13], ['autumn'], [0], 'autumn'):
            with self.subTest(months=months):
                response = self.client.post(
                    '/api/catalog/seasons/',
                    {'name': 'Autumn', 'slug': f'autumn-{months}', 'months': months},
                    content_type='application/json',
                )
                self.assertEqual(response.status_code, 400)


class LocationTests(IsolatedMediaTestCase):
    def test_sensitive_coordinates_are_blurred_for_everyone(self):
        """Including staff - see the note on LocationSerializer, the cache is shared."""
        Location.objects.create(
            name='Heron Nest', slug='heron-nest',
            latitude='37.428193', longitude='-122.143219',
            hide_precise_location=True,
        )
        payload = self.client.get('/api/catalog/locations/slug/heron-nest/').json()
        self.assertEqual(payload['latitude'], 37.43)
        self.assertEqual(payload['longitude'], -122.14)

        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        payload = self.client.get('/api/catalog/locations/slug/heron-nest/').json()
        self.assertEqual(payload['latitude'], 37.43)

    def test_ordinary_coordinates_are_published_exactly(self):
        Location.objects.create(
            name='Oak Hollow', slug='oak-hollow',
            latitude='37.428193', longitude='-122.143219',
        )
        payload = self.client.get('/api/catalog/locations/slug/oak-hollow/').json()
        self.assertEqual(payload['latitude'], 37.428193)

    def test_a_location_cannot_be_its_own_parent(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        location = Location.objects.create(name='Oak Hollow', slug='oak-hollow')
        response = self.client.patch(
            f'/api/catalog/locations/{location.pk}/',
            {'parent': location.pk},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)


class CacheInvalidationTests(CatalogFixtureMixin, IsolatedMediaTestCase):
    def setUp(self):
        super().setUp()
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

    def test_creating_a_species_updates_the_cached_category_count(self):
        """The cross-model case: nothing about the Category row changed, but its
        cached payload embeds a count of species."""
        category = self.make_category()
        self.assertEqual(self.client.get('/api/catalog/categories/').json()[0]['species_count'], 0)

        response = self.client.post(
            '/api/catalog/species/',
            {'category': category.pk, 'name': 'Mule Deer', 'slug': 'mule-deer'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(self.client.get('/api/catalog/categories/').json()[0]['species_count'], 1)

    def test_renaming_a_category_updates_the_cached_species_payload(self):
        species = self.make_species()
        detail = f'/api/catalog/species/{species.pk}/'
        self.assertEqual(self.client.get(detail).json()['category_name'], 'Deer')

        self.client.patch(
            f'/api/catalog/categories/{species.category_id}/',
            {'name': 'Deer & Elk'},
            content_type='application/json',
        )
        self.assertEqual(self.client.get(detail).json()['category_name'], 'Deer & Elk')

    def test_a_renamed_slug_does_not_serve_the_old_url(self):
        species = self.make_species()
        self.assertEqual(self.client.get('/api/catalog/species/slug/white-tailed-deer/').status_code, 200)

        self.client.patch(
            f'/api/catalog/species/{species.pk}/',
            {'slug': 'whitetail-deer'},
            content_type='application/json',
        )
        self.assertEqual(self.client.get('/api/catalog/species/slug/white-tailed-deer/').status_code, 404)
        self.assertEqual(self.client.get('/api/catalog/species/slug/whitetail-deer/').status_code, 200)


class SlugUniquenessTests(CatalogFixtureMixin, IsolatedMediaTestCase):
    def test_a_duplicate_slug_is_a_field_error(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        self.make_category()

        response = self.client.post(
            '/api/catalog/categories/',
            {'name': 'Deer again', 'slug': 'deer', 'kind': 'animal'},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('slug', response.json())
