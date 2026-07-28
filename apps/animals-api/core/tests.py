"""Shared test scaffolding.

``IsolatedMediaTestCase`` is the important one: every write test in this project
saves a real file, and without it those files land in the developer's own
``media/`` directory and stay there.
"""

import base64
import shutil
import tempfile
from io import BytesIO

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
