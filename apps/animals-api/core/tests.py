"""Shared test scaffolding.

``IsolatedMediaTestCase`` is the important one: every write test in this project
saves a real file, and without it those files land in the developer's own
``media/`` directory and stay there.
"""

import base64
import shutil
import tempfile
from io import BytesIO
from unittest import mock

from django.contrib.auth.models import User
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

    Also clears the cache between tests: the views cache their responses, and
    LocMemCache is shared across a test process, so without this one test's
    cached list is served to the next one.
    """

    @classmethod
    def setUpClass(cls):
        cls._media_root = tempfile.mkdtemp(prefix='animals-test-media-')
        cls._media_override = override_settings(MEDIA_ROOT=cls._media_root)
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
