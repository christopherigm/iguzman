"""Shared test scaffolding.

``IsolatedMediaTestCase`` is the important one: every write test in this project
saves a real file, and without it those files land in the developer's own
``media/`` directory and stay there.
"""

import base64
import json
import shutil
import tempfile
from datetime import date, timedelta
from io import BytesIO
from unittest import mock

from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from PIL import Image


def base64_image(size=(64, 64), fmt='JPEG', color=(120, 160, 90)):
    """A small, real, decodable image as a base64 string (no data-URL prefix)."""
    buffer = BytesIO()
    Image.new('RGB', size, color).save(buffer, format=fmt)
    return base64.b64encode(buffer.getvalue()).decode()


def data_url(size=(64, 64), fmt='JPEG'):
    """The same, as a data URL - the shape a browser's FileReader produces."""
    return f'data:image/{fmt.lower()};base64,{base64_image(size, fmt)}'


class IsolatedMediaTestCase(TestCase):
    """A TestCase whose uploads go to a temp directory that is removed afterwards.

    It also pins two cache settings for every test that inherits it:

    * **The response cache is forced on.** ``API_CACHE_ENABLED`` defaults to off
      whenever ``DEBUG`` is set - which is exactly how a developer's ``.env`` is
      configured - so without this override every cache-invalidation regression
      in this project would pass for the trivial reason that nothing was ever
      cached. They have to run against the production path to mean anything.
    * **``core.testing.PatternLocMemCache``**, so a test never reaches the
      cluster Redis a developer's ``.env`` points at *and* still behaves like it.
      Plain LocMemCache has no ``delete_pattern``, so ``invalidate_pattern``
      falls back to clearing everything and an incomplete receiver passes. Read
      that module's docstring before changing this line.

    And it clears the cache between tests: LocMemCache is shared across a test
    process, so without that one test's cached list is served to the next one.
    """

    @classmethod
    def setUpClass(cls):
        cls._media_root = tempfile.mkdtemp(prefix='animals-test-media-')
        cls._media_override = override_settings(
            MEDIA_ROOT=cls._media_root,
            API_CACHE_ENABLED=True,
            CACHES={'default': {'BACKEND': 'core.testing.PatternLocMemCache'}},
        )
        cls._media_override.enable()
        super().setUpClass()

    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        cls._media_override.disable()
        shutil.rmtree(cls._media_root, ignore_errors=True)

    def setUp(self):
        super().setUp()
        from django.core.cache import cache

        cache.clear()

    @staticmethod
    def make_staff(username='ranger', password='fieldnotes-2026'):
        return User.objects.create_user(
            username=username, password=password, is_staff=True
        )

    @staticmethod
    def make_visitor(username='visitor', password='just-looking-2026'):
        return User.objects.create_user(username=username, password=password)

    @staticmethod
    def make_admin(username='author', password='fieldnotes-2026'):
        """A site administrator who is **not** Django staff.

        The whole point of ``UserProfile.is_admin``: someone who may author the
        site through the CMS without having a login to the Django admin. Every
        write test that uses this instead of ``make_staff`` is what proves the
        two are genuinely independent.
        """
        from users.models import UserProfile

        user = User.objects.create_user(username=username, password=password)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.is_admin = True
        profile.save(update_fields=['is_admin'])
        # `users.signals` creates the profile during `create_user`, and doing so
        # populates the one-to-one cache on `user` - so without this refresh
        # `user.profile` keeps returning the pre-flag copy and every permission
        # check below reads False.
        user.refresh_from_db()
        return user


class AiEndpointTests(IsolatedMediaTestCase):
    """The `/api/ai/*` authoring tools.

    The provider is always mocked - a test suite must not spend money or need a
    network. What is worth pinning down here is everything *around* the provider:
    who may call, what happens with no key configured, and that a model's answer
    is filtered before it can reach a row.
    """

    URLS = (
        ('/api/ai/chat/', {'messages': [{'role': 'user', 'content': 'hola'}]}),
        ('/api/ai/translate/', {'fields': {'name': 'Venado'}, 'target': 'en'}),
        ('/api/ai/copy/', {'subject': 'Venado'}),
        ('/api/ai/research/', {'subject': 'species', 'name': 'Venado'}),
    )

    def post(self, url, body):
        return self.client.post(url, body, content_type='application/json')

    # ── Permissions ──────────────────────────────────────────────────────────

    def test_anonymous_is_refused_everywhere(self):
        for url, body in self.URLS:
            with self.subTest(url=url):
                self.assertEqual(self.post(url, body).status_code, 401)

    def test_a_signed_in_non_staff_visitor_is_refused(self):
        # Unlike every read endpoint in this project, these are staff-only: they
        # spend money and write copy published under the journal's name.
        self.make_visitor()
        self.client.login(username='visitor', password='just-looking-2026')
        for url, body in self.URLS:
            with self.subTest(url=url):
                self.assertEqual(self.post(url, body).status_code, 403)

    # ── Configuration ────────────────────────────────────────────────────────

    @override_settings(GROQ_API_KEY='', OPENROUTER_API_KEY='')
    def test_no_provider_key_is_a_503_before_anything_streams(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        for url, body in self.URLS:
            with self.subTest(url=url):
                self.assertEqual(self.post(url, body).status_code, 503)

    # ── Translate ────────────────────────────────────────────────────────────

    @override_settings(GROQ_API_KEY='test-key')
    def test_translate_returns_the_requested_keys(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

        with mock.patch(
            'core.services.authoring.chat_json',
            return_value={'name': 'White-tailed Deer', 'description': 'A common deer.'},
        ):
            response = self.post(
                '/api/ai/translate/',
                {
                    'fields': {'name': 'Venado cola blanca', 'description': 'Un venado común.'},
                    'target': 'en',
                },
            )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            response.json()['fields'],
            {'name': 'White-tailed Deer', 'description': 'A common deer.'},
        )

    @override_settings(GROQ_API_KEY='test-key')
    def test_translate_drops_keys_it_was_not_asked_about(self):
        # The model occasionally answers with an extra key. Written onto a row
        # verbatim that is a silent, wrong edit.
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

        with mock.patch(
            'core.services.authoring.chat_json',
            return_value={'name': 'Deer', 'slug': 'deer', 'enabled': False},
        ):
            response = self.post(
                '/api/ai/translate/', {'fields': {'name': 'Venado'}, 'target': 'en'}
            )

        self.assertEqual(response.json()['fields'], {'name': 'Deer'})

    def test_translate_rejects_a_field_that_is_not_translatable(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        response = self.post(
            '/api/ai/translate/', {'fields': {'slug': 'deer'}, 'target': 'en'}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('fields', response.json())

    # ── Research ─────────────────────────────────────────────────────────────

    @override_settings(GROQ_API_KEY='test-key', SCRAPER_API_KEY='')
    def test_research_answers_without_the_scraper(self):
        # An unconfigured (or down) scraper degrades to the model's own
        # knowledge rather than failing - `used_web_search` says which happened.
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

        with mock.patch(
            'catalog.services.research.chat_json',
            return_value={
                'name': 'Venado cola blanca',
                'en_name': 'White-tailed Deer',
                'scientific_name': 'Odocoileus virginianus',
            },
        ):
            response = self.post(
                '/api/ai/research/', {'subject': 'species', 'name': 'venado cola blanca'}
            )

        body = response.json()
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(body['used_web_search'])
        self.assertEqual(body['sources'], [])
        self.assertEqual(body['fields']['scientific_name'], 'Odocoileus virginianus')

    @override_settings(GROQ_API_KEY='test-key', SCRAPER_API_KEY='')
    def test_research_keeps_only_real_fields_of_the_model(self):
        # The allowlist is what stops a hallucinated *field* from reaching a row.
        # `slug` in particular is a unique key the author owns.
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

        with mock.patch(
            'catalog.services.research.chat_json',
            return_value={
                'name': 'Venado',
                'slug': 'venado',
                'id': 7,
                'image': 'http://example.com/deer.jpg',
                'family': None,
                'en_name': 'unknown',
            },
        ):
            body = self.post(
                '/api/ai/research/', {'subject': 'species', 'name': 'venado'}
            ).json()

        self.assertEqual(body['fields'], {'name': 'Venado'})

    @override_settings(GROQ_API_KEY='test-key', SCRAPER_API_KEY='')
    def test_research_drops_an_out_of_range_coordinate(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

        with mock.patch(
            'catalog.services.research.chat_json',
            return_value={'name': 'Chapultepec', 'latitude': '19.4204', 'longitude': 999},
        ):
            fields = self.post(
                '/api/ai/research/', {'subject': 'location', 'name': 'Chapultepec'}
            ).json()['fields']

        self.assertEqual(fields['latitude'], 19.4204)
        self.assertNotIn('longitude', fields)

    def test_research_rejects_an_unknown_subject(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        response = self.post(
            '/api/ai/research/', {'subject': 'sighting', 'name': 'Venado'}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('subject', response.json())

    # ── Chat (streaming) ─────────────────────────────────────────────────────

    @override_settings(GROQ_API_KEY='test-key')
    def test_chat_streams_sse_and_is_not_buffered_by_nginx(self):
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

        with mock.patch('core.ai_views.llm.stream_chat', return_value=iter(['Ve', 'nado'])):
            response = self.post(
                '/api/ai/chat/', {'messages': [{'role': 'user', 'content': 'hola'}]}
            )
            body = b''.join(response.streaming_content).decode()

        self.assertEqual(response['Content-Type'], 'text/event-stream')
        # Without this header nginx holds the whole completion and delivers it in
        # one lump, defeating the streaming UI.
        self.assertEqual(response['X-Accel-Buffering'], 'no')
        self.assertIn('"content": "Ve"', body)
        self.assertTrue(body.endswith('data: [DONE]\n\n'))

    @override_settings(GROQ_API_KEY='test-key')
    def test_a_provider_failure_mid_stream_is_reported_inside_the_stream(self):
        # StreamingHttpResponse commits the 200 before the generator runs, so an
        # error can only travel as an SSE event - never as a status code.
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')

        with mock.patch('core.ai_views.llm.stream_chat', side_effect=RuntimeError('boom')):
            response = self.post(
                '/api/ai/chat/', {'messages': [{'role': 'user', 'content': 'hola'}]}
            )
            body = b''.join(response.streaming_content).decode()

        self.assertEqual(response.status_code, 200)
        self.assertIn('"error"', body)
        # The upstream message can carry prompt text and account details.
        self.assertNotIn('boom', body)


class SiteAdminPermissionTests(IsolatedMediaTestCase):
    """`UserProfile.is_admin` and `is_staff` must both open the write API.

    The reason this file has tests at all: the CMS moved out of the Django admin
    into `apps/animals`, so authoring no longer implies a Django login. If these
    ever diverge, one of two things breaks silently - either the site's author
    cannot save, or an ordinary reader can.
    """

    def setUp(self):
        super().setUp()
        from catalog.models import Category

        self.category = Category.objects.create(name='Venados', slug='venados', kind='animal')

    def _patch(self):
        return self.client.patch(
            f'/api/catalog/categories/{self.category.pk}/',
            data='{"name": "Ciervos"}',
            content_type='application/json',
        )

    def test_a_site_admin_who_is_not_django_staff_may_write(self):
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        self.assertEqual(self._patch().status_code, 200)

    def test_django_staff_may_still_write_without_the_flag(self):
        # Every account that authored this site before `is_admin` existed is
        # staff and has no profile at all; none of them may lose write access.
        self.make_staff()
        self.client.login(username='ranger', password='fieldnotes-2026')
        self.assertEqual(self._patch().status_code, 200)

    def test_an_ordinary_signed_in_reader_may_not_write(self):
        self.make_visitor()
        self.client.login(username='visitor', password='just-looking-2026')
        self.assertEqual(self._patch().status_code, 403)

    def test_include_disabled_is_ignored_for_a_reader_and_honoured_for_an_admin(self):
        from catalog.models import Category

        Category.objects.create(name='Borrador', slug='borrador', kind='plant', enabled=False)

        self.assertEqual(len(self.client.get('/api/catalog/categories/?include_disabled=true').json()), 1)

        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        self.assertEqual(len(self.client.get('/api/catalog/categories/?include_disabled=true').json()), 2)

    def test_the_token_claims_say_admin_for_both_kinds_of_admin(self):
        from users.serializers import CustomTokenObtainPairSerializer

        staff = self.make_staff()
        admin = self.make_admin()
        reader = self.make_visitor()

        def claims(user):
            return CustomTokenObtainPairSerializer.get_token(user)

        # The frontend gates the CMS on `is_admin` alone, so staff must carry it
        # too or an operator would see no Admin link on a site they can edit.
        self.assertTrue(claims(staff)['is_admin'])
        self.assertTrue(claims(staff)['is_staff'])
        self.assertTrue(claims(admin)['is_admin'])
        self.assertFalse(claims(admin)['is_staff'])
        self.assertFalse(claims(reader)['is_admin'])


class SystemEndpointTests(IsolatedMediaTestCase):
    """`/api/system/` - the singleton every public page reads."""

    def test_get_creates_and_serves_the_row_on_a_fresh_database(self):
        from core.models import System

        self.assertFalse(System.objects.exists())
        response = self.client.get('/api/system/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['site_name'], 'Field Journal')
        self.assertTrue(System.objects.exists())

    def test_patch_is_admin_only(self):
        self.assertEqual(
            self.client.patch(
                '/api/system/', data='{"site_name": "Hijacked"}',
                content_type='application/json',
            ).status_code,
            401,
        )
        self.make_visitor()
        self.client.login(username='visitor', password='just-looking-2026')
        self.assertEqual(
            self.client.patch(
                '/api/system/', data='{"site_name": "Hijacked"}',
                content_type='application/json',
            ).status_code,
            403,
        )

    def test_a_write_is_visible_on_the_next_read(self):
        # The payload is cached under one key and read on every page of the
        # site, so a missed invalidation here is the most visible kind there is.
        self.client.get('/api/system/')
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        self.client.patch(
            '/api/system/', data='{"site_name": "Cuaderno de Campo"}',
            content_type='application/json',
        )
        self.client.logout()
        self.assertEqual(self.client.get('/api/system/').json()['site_name'], 'Cuaderno de Campo')

    def test_an_image_round_trips_as_base64_and_comes_back_as_a_url(self):
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.patch(
            '/api/system/',
            data=json.dumps({'img_logo': data_url(fmt='PNG')}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue((response.json()['img_logo'] or '').endswith('.png'))

    def test_a_font_url_off_google_is_refused(self):
        # The value lands in a <link rel="stylesheet"> on every page, so this is
        # not merely a data check - see core/models.validate_google_font_url.
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.patch(
            '/api/system/',
            data=json.dumps({'google_font_url': 'https://evil.example/font.css'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_a_social_link_without_a_url_is_refused(self):
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.patch(
            '/api/system/',
            data=json.dumps({'social_links': [{'platform': 'instagram'}]}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)


class BackupRoundTripTests(IsolatedMediaTestCase):
    """Build an archive, destroy the site, restore it, and check it came back."""

    def setUp(self):
        super().setUp()
        from catalog.models import Category, Season, Species
        from core.models import System
        from journal.models import Sighting

        system = System.load()
        system.site_name = 'Cuaderno de Campo'
        system.save()

        self.category = Category.objects.create(name='Venados', slug='venados', kind='animal')
        self.species = Species.objects.create(
            category=self.category, name='Venado cola blanca', slug='venado-cola-blanca',
            scientific_name='Odocoileus virginianus',
        )
        Season.objects.create(name='Otoño', slug='otono', months=[9, 10, 11])
        self.sighting = Sighting.objects.create(
            species=self.species, slug='primer-venado', date=date(2026, 10, 4),
            name='Primer venado del otoño',
        )

    def _archive(self, sections=None):
        from core.backup import ALL_SECTIONS, write_archive

        return write_archive(list(sections or ALL_SECTIONS))

    def test_a_replace_restore_rebuilds_what_was_deleted(self):
        import os

        from catalog.models import Category, Species
        from core.backup import restore_archive
        from journal.models import Sighting

        path, manifest = self._archive()
        try:
            self.assertEqual(manifest['counts']['journal.sighting'], 1)

            # PROTECT edges mean the teardown has to run children-first, which
            # is exactly the order the restorer walks in reverse.
            Sighting.objects.all().delete()
            Species.objects.all().delete()
            Category.objects.all().delete()

            restore_archive(path, manifest['sections'], mode='replace')
        finally:
            os.unlink(path)

        self.assertEqual(Category.objects.count(), 1)
        restored = Sighting.objects.get(slug='primer-venado')
        self.assertEqual(restored.name, 'Primer venado del otoño')
        # The FK is remapped through the id map, not carried as a raw pk.
        self.assertEqual(restored.species.slug, 'venado-cola-blanca')

    def test_a_restore_does_not_stamp_every_row_with_the_current_time(self):
        import os

        from django.db.models import F
        from journal.models import Sighting

        from core.backup import restore_archive

        # Age the row so "restored verbatim" is distinguishable from "now".
        Sighting.objects.filter(pk=self.sighting.pk).update(
            created=F('created') - timedelta(days=400)
        )
        original = Sighting.objects.get(pk=self.sighting.pk).created

        path, manifest = self._archive()
        try:
            restore_archive(path, manifest['sections'], mode='merge')
        finally:
            os.unlink(path)

        self.assertEqual(Sighting.objects.get(slug='primer-venado').created, original)

    def test_the_settings_row_and_its_images_come_back(self):
        import os

        from core.backup import restore_archive
        from core.models import System

        system = System.load()
        system.img_logo.save('logo.png', ContentFile(base64.b64decode(base64_image(fmt='PNG'))), save=True)

        path, manifest = self._archive()
        try:
            self.assertGreaterEqual(manifest['media_files'], 1)
            system.site_name = 'Something else'
            system.img_logo.delete(save=True)
            system.save()

            restore_archive(path, manifest['sections'], mode='merge')
        finally:
            os.unlink(path)

        restored = System.load()
        self.assertEqual(restored.site_name, 'Cuaderno de Campo')
        self.assertTrue(restored.img_logo)

    def test_an_archive_missing_a_requested_section_is_refused(self):
        import os

        from core.backup import BackupError, restore_archive

        path, _ = self._archive(sections=['settings'])
        try:
            with self.assertRaises(BackupError):
                restore_archive(path, ['catalog'])
        finally:
            os.unlink(path)

    def test_a_file_that_is_not_a_zip_is_refused_with_a_readable_message(self):
        import os
        import tempfile

        from core.backup import BackupError, read_manifest

        handle = tempfile.NamedTemporaryFile(suffix='.zip', delete=False)
        handle.write(b'not a zip at all')
        handle.close()
        try:
            with self.assertRaises(BackupError):
                read_manifest(handle.name)
        finally:
            os.unlink(handle.name)

    def test_a_restored_account_cannot_be_signed_into(self):
        # No password hash travels in a backup, by design.
        import os

        from django.contrib.auth.models import User

        from core.backup import restore_archive

        User.objects.create_user(username='someone@example.com', password='was-a-real-one')
        path, manifest = self._archive()
        try:
            User.objects.filter(username='someone@example.com').delete()
            restore_archive(path, manifest['sections'], mode='merge')
        finally:
            os.unlink(path)

        restored = User.objects.get(username='someone@example.com')
        self.assertFalse(restored.has_usable_password())


class BackupApiTests(IsolatedMediaTestCase):
    """The endpoints around the engine: who may call, and what they return."""

    def setUp(self):
        super().setUp()
        from catalog.models import Category

        Category.objects.create(name='Venados', slug='venados', kind='animal')

    def test_every_backup_endpoint_refuses_a_non_admin(self):
        self.make_visitor()
        self.client.login(username='visitor', password='just-looking-2026')
        self.assertEqual(self.client.get('/api/backups/').status_code, 403)
        self.assertEqual(self.client.post('/api/backups/', {'name': 'x'}).status_code, 403)
        self.assertEqual(self.client.post('/api/backups/restore/', {}).status_code, 403)

    def test_create_then_list_then_download_then_delete(self):
        from core.models import SiteBackup

        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')

        created = self.client.post(
            '/api/backups/',
            data=json.dumps({'name': 'Before the rewrite', 'sections': ['settings', 'catalog', 'images']}),
            content_type='application/json',
        )
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertGreater(body['size_bytes'], 0)
        # Publishing the file's URL would route around the download view, which
        # is the only sanctioned read path for an archive.
        self.assertNotIn('file', body)

        listing = self.client.get('/api/backups/').json()
        self.assertEqual(len(listing), 1)

        download = self.client.get(f'/api/backups/{body["id"]}/download/')
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download['Content-Type'], 'application/zip')
        b''.join(download.streaming_content)  # drain, so the temp file closes

        self.assertEqual(self.client.delete(f'/api/backups/{body["id"]}/').status_code, 204)
        self.assertFalse(SiteBackup.objects.exists())

    def test_a_backup_of_images_alone_is_refused(self):
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.post(
            '/api/backups/',
            data=json.dumps({'name': 'Nothing', 'sections': ['images']}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_restoring_a_junk_upload_reports_a_400_rather_than_a_500(self):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.post(
            '/api/backups/restore/',
            {'file': SimpleUploadedFile('backup.zip', b'not a zip'), 'mode': 'merge'},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('detail', response.json())


class AdminUserApiTests(IsolatedMediaTestCase):
    """`/api/auth/admin/users/` - the CMS's user list."""

    def test_it_refuses_a_non_admin(self):
        self.make_visitor()
        self.client.login(username='visitor', password='just-looking-2026')
        self.assertEqual(self.client.get('/api/auth/admin/users/').status_code, 403)

    def test_an_admin_can_grant_and_revoke_the_flag(self):
        from users.models import UserProfile

        self.make_admin()
        target = self.make_visitor()
        self.client.login(username='author', password='fieldnotes-2026')

        response = self.client.patch(
            f'/api/auth/admin/users/{target.pk}/',
            data=json.dumps({'is_admin': True}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['is_admin'])
        self.assertTrue(UserProfile.objects.get(user=target).is_admin)

        self.client.patch(
            f'/api/auth/admin/users/{target.pk}/',
            data=json.dumps({'is_admin': False}),
            content_type='application/json',
        )
        self.assertFalse(UserProfile.objects.get(user=target).is_admin)

    def test_an_admin_cannot_demote_themselves(self):
        # There may be no second administrator, and the CMS has no way back in.
        admin = self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        response = self.client.patch(
            f'/api/auth/admin/users/{admin.pk}/',
            data=json.dumps({'is_admin': False}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)

    def test_the_payload_never_carries_a_password_hash(self):
        self.make_admin()
        self.client.login(username='author', password='fieldnotes-2026')
        for row in self.client.get('/api/auth/admin/users/').json():
            self.assertNotIn('password', row)


class BrandedEmailTests(IsolatedMediaTestCase):
    """Account email carries the site's brand kit, in both body parts.

    The chrome is rendered from `core.System`, so these assert the two things a
    template change can silently break: that the CMS's logo and palette actually
    reach the HTML, and that the plain-text alternative still carries a working
    link for a client that refuses HTML.
    """

    def setUp(self):
        super().setUp()
        from core.models import System

        system = System.load()
        system.site_name = 'Cuaderno de Campo'
        system.site_description = 'Un diario de lo que se ve en el monte.'
        system.primary_color = '#2f6f4e'
        system.secondary_color = '#d9a441'
        system.img_logo.save('logo.png', ContentFile(base64.b64decode(
            base64_image(size=(32, 32), fmt='PNG')
        )), save=True)

    @staticmethod
    def _parts(message):
        """The text body and the HTML alternative of a sent message."""
        html = next(
            content for content, mimetype in message.alternatives
            if mimetype == 'text/html'
        )
        return message.body, html

    def test_signup_sends_a_branded_two_part_email(self):
        from django.core import mail

        response = self.client.post(
            '/api/auth/signup/',
            data=json.dumps({
                'email': 'naturalist@example.com',
                'first_name': 'Ana',
                'password': 'field-notes-2026!',
                'password2': 'field-notes-2026!',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()['email_sent'])

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        text, html = self._parts(message)

        # The sender is named after the site, not the SMTP mailbox.
        self.assertTrue(message.from_email.startswith('Cuaderno de Campo <'))
        self.assertIn('Cuaderno de Campo', html)
        self.assertIn('#2f6f4e', html)   # primary - header and button
        self.assertIn('#d9a441', html)   # secondary - accent rule
        self.assertIn('Un diario de lo que se ve en el monte.', html)

        # The logo is embedded absolutely: an email client has no request to
        # resolve `/media/...` against.
        self.assertIn('<img src="https://', html)

        # Both parts carry the same working link, on the frontend's own domain.
        from users.models import EmailVerificationToken

        token = EmailVerificationToken.objects.get()
        action_url = f'{settings.FRONTEND_URL.rstrip("/")}/verify-email/{token.token}'
        self.assertIn(action_url, html)
        self.assertIn(action_url, text)

    def test_password_reset_sends_the_reset_link(self):
        from django.core import mail
        from users.models import PasswordResetToken

        User.objects.create_user(
            username='ana', email='ana@example.com', password='field-notes-2026!'
        )
        response = self.client.post(
            '/api/auth/password-reset/',
            data=json.dumps({'email': 'ana@example.com'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)

        self.assertEqual(len(mail.outbox), 1)
        text, html = self._parts(mail.outbox[0])
        token = PasswordResetToken.objects.get()
        action_url = f'{settings.FRONTEND_URL.rstrip("/")}/reset-password/{token.token}'
        self.assertIn(action_url, html)
        self.assertIn(action_url, text)

    def test_an_unbranded_site_still_sends(self):
        """A fresh database has no logo and no description - and must not 500."""
        from django.core import mail
        from core.models import System

        system = System.load()
        system.img_logo.delete(save=False)
        system.site_description = ''
        system.save()

        User.objects.create_user(
            username='ana', email='ana@example.com', password='field-notes-2026!'
        )
        self.client.post(
            '/api/auth/password-reset/',
            data=json.dumps({'email': 'ana@example.com'}),
            content_type='application/json',
        )

        self.assertEqual(len(mail.outbox), 1)
        _, html = self._parts(mail.outbox[0])
        # With no logo the header falls back to the site's name as text.
        self.assertNotIn('<img', html)
        self.assertIn('Cuaderno de Campo', html)
