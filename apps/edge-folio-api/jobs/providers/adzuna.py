import logging
import time
from typing import Optional

import requests
from django.conf import settings

from .base import NormalizedPosting, ProviderClient, ProviderError, infer_work_type, to_decimal

logger = logging.getLogger(__name__)

_BASE_URL = 'https://api.adzuna.com/v1/api/jobs'
_RESULTS_PER_PAGE = 50
_TIMEOUT = 30
# Adzuna does not return a currency; it is implied by the country market.
_COUNTRY_CURRENCY = {'us': 'USD', 'ca': 'CAD', 'mx': 'MXN', 'gb': 'GBP'}
_SUPPORTED_COUNTRIES = set(_COUNTRY_CURRENCY)


class AdzunaClient(ProviderClient):
    provider = 'adzuna'

    def __init__(self, api_key: Optional[str] = None):
        # Adzuna uses an app_id + app_key pair. BYOK is passed as "app_id:app_key".
        if api_key:
            app_id, _, app_key = api_key.partition(':')
            self.app_id = app_id.strip()
            self.app_key = app_key.strip()
        else:
            self.app_id = settings.ADZUNA_APP_ID
            self.app_key = settings.ADZUNA_APP_KEY
        if not self.app_id or not self.app_key:
            raise ProviderError('Adzuna credentials are not configured.')

    def search(
        self,
        query: str,
        location: str = '',
        country: str = 'us',
        page: int = 1,
    ) -> list[NormalizedPosting]:
        country = (country or 'us').lower()
        if country not in _SUPPORTED_COUNTRIES:
            country = 'us'

        params = {
            'app_id': self.app_id,
            'app_key': self.app_key,
            'what': query,
            'results_per_page': _RESULTS_PER_PAGE,
            'content-type': 'application/json',
        }
        if location:
            params['where'] = location

        url = f'{_BASE_URL}/{country}/search/{max(1, page)}'
        try:
            resp = requests.get(url, params=params, timeout=_TIMEOUT)
        except requests.RequestException as exc:
            raise ProviderError(f'Adzuna request failed: {exc}') from exc

        if resp.status_code == 429:
            # Honor the free-tier rate limit with a short backoff before failing.
            logger.warning('Adzuna rate limited (429); backing off.')
            time.sleep(2)
            raise ProviderError('Adzuna rate limit reached (429).')
        if not resp.ok:
            raise ProviderError(f'Adzuna returned {resp.status_code}: {resp.text[:200]}')

        results = resp.json().get('results', [])
        currency = _COUNTRY_CURRENCY.get(country, '')
        return [self._normalize(item, country, currency) for item in results]

    def _normalize(self, item: dict, country: str, currency: str) -> NormalizedPosting:
        company = (item.get('company') or {}).get('display_name', '')
        loc = (item.get('location') or {}).get('display_name', '')
        category = (item.get('category') or {}).get('label', '')
        title = item.get('title', '') or ''
        description = item.get('description', '') or ''

        tags: list[str] = []
        for key in ('contract_time', 'contract_type'):
            val = item.get(key)
            if val:
                tags.append(str(val))

        return NormalizedPosting(
            provider=self.provider,
            provider_uid=str(item.get('id', '')),
            company_name=company,
            job_title=title,
            job_description=description,
            job_url=item.get('redirect_url', '') or '',
            salary_min=to_decimal(item.get('salary_min')),
            salary_max=to_decimal(item.get('salary_max')),
            salary_currency=currency,
            work_type=infer_work_type(title, description, loc),
            location=loc,
            country=country,
            category=category,
            tags=tags,
            raw=item,
        )
