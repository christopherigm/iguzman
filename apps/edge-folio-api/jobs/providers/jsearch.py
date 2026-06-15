import logging
import time
from typing import Optional

import requests
from django.conf import settings

from .base import NormalizedPosting, ProviderClient, ProviderError, infer_work_type, to_decimal

logger = logging.getLogger(__name__)

_BASE_URL = 'https://jsearch.p.rapidapi.com/search'
_HOST = 'jsearch.p.rapidapi.com'
_TIMEOUT = 30


class JSearchClient(ProviderClient):
    provider = 'jsearch'

    def __init__(self, api_key: Optional[str] = None):
        # Works for both the platform RapidAPI key and a user's BYOK key.
        self.api_key = api_key or settings.JSEARCH_API_KEY
        if not self.api_key:
            raise ProviderError('JSearch API key is not configured.')

    def search(
        self,
        query: str,
        location: str = '',
        country: str = 'us',
        page: int = 1,
    ) -> list[NormalizedPosting]:
        country = (country or 'us').lower()
        full_query = f'{query} in {location}' if location else query
        params = {
            'query': full_query,
            'page': str(max(1, page)),
            'num_pages': '1',
            'country': country,
        }
        headers = {
            'X-RapidAPI-Key': self.api_key,
            'X-RapidAPI-Host': _HOST,
        }
        try:
            resp = requests.get(_BASE_URL, params=params, headers=headers, timeout=_TIMEOUT)
        except requests.RequestException as exc:
            raise ProviderError(f'JSearch request failed: {exc}') from exc

        if resp.status_code == 429:
            logger.warning('JSearch rate limited (429); backing off.')
            time.sleep(2)
            raise ProviderError('JSearch rate limit reached (429).')
        if not resp.ok:
            raise ProviderError(f'JSearch returned {resp.status_code}: {resp.text[:200]}')

        results = resp.json().get('data', []) or []
        return [self._normalize(item, country) for item in results]

    def _normalize(self, item: dict, country: str) -> NormalizedPosting:
        city = item.get('job_city') or ''
        state = item.get('job_state') or ''
        loc = ', '.join(p for p in (city, state) if p)
        item_country = (item.get('job_country') or country or '').lower()

        title = item.get('job_title', '') or ''
        description = item.get('job_description', '') or ''

        work_type = infer_work_type(title, description, loc)
        if item.get('job_is_remote') and 'remote' not in work_type:
            work_type.insert(0, 'remote')

        emp_type = item.get('job_employment_type')
        tags = [str(emp_type)] if emp_type else []

        return NormalizedPosting(
            provider=self.provider,
            provider_uid=str(item.get('job_id', '')),
            company_name=item.get('employer_name', '') or '',
            job_title=title,
            job_description=description,
            job_url=item.get('job_apply_link', '') or '',
            salary_min=to_decimal(item.get('job_min_salary')),
            salary_max=to_decimal(item.get('job_max_salary')),
            salary_currency=(item.get('job_salary_currency') or '').upper()[:3],
            work_type=work_type,
            location=loc,
            country=item_country[:2],
            category=item.get('job_category', '') or '',
            tags=tags,
            raw=item,
        )
