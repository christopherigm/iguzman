from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class ProviderError(Exception):
    """Raised when a provider request fails or is misconfigured."""


class NormalizedPosting(BaseModel):
    """Provider-agnostic posting shape that maps 1:1 onto ``jobs.JobPosting``.

    Lifecycle fields (``dedup_hash``, ``fetched_at``, ``expires_at``, ownership)
    are assigned by the ingestion layer, not the provider client.
    """

    provider: str
    provider_uid: str
    company_name: str = ''
    job_title: str = ''
    job_description: str = ''
    job_url: str = ''
    salary_min: Optional[Decimal] = None
    salary_max: Optional[Decimal] = None
    salary_currency: str = ''
    work_type: list[str] = Field(default_factory=list)
    location: str = ''
    country: str = ''
    category: str = ''
    tags: list[str] = Field(default_factory=list)
    raw: dict = Field(default_factory=dict)


class ProviderClient(ABC):
    """Abstract base every provider client implements."""

    provider: str

    @abstractmethod
    def search(
        self,
        query: str,
        location: str = '',
        country: str = 'us',
        page: int = 1,
    ) -> list[NormalizedPosting]:
        """Return a page of normalized postings for the given query."""
        raise NotImplementedError


# ── Shared helpers ───────────────────────────────────────────────────────────────

_REMOTE_TOKENS = ('remote', 'work from home', 'wfh', 'anywhere')
_HYBRID_TOKENS = ('hybrid',)
_ONSITE_TOKENS = ('on-site', 'on site', 'onsite', 'in office', 'in-office')


def infer_work_type(*texts: str) -> list[str]:
    """Best-effort work-type inference from free text (title/description/location)."""
    blob = ' '.join(t.lower() for t in texts if t)
    found: list[str] = []
    if any(tok in blob for tok in _REMOTE_TOKENS):
        found.append('remote')
    if any(tok in blob for tok in _HYBRID_TOKENS):
        found.append('hybrid')
    if any(tok in blob for tok in _ONSITE_TOKENS):
        found.append('onsite')
    return found


def to_decimal(value) -> Optional[Decimal]:
    if value is None or value == '':
        return None
    try:
        return Decimal(str(round(float(value), 2)))
    except (TypeError, ValueError):
        return None
