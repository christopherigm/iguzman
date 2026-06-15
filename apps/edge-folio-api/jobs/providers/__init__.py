"""Job posting provider clients.

A thin, swappable abstraction over each external jobs API. Every client maps its
provider's payload onto the shared :class:`NormalizedPosting` shape so the
ingestion layer never needs provider-specific knowledge. Adding a new provider
(e.g. Techmap) is just a new module + an entry in :func:`get_client`.
"""

from .base import NormalizedPosting, ProviderClient, ProviderError


def get_client(provider: str, api_key: str | None = None) -> ProviderClient:
    """Return a provider client.

    ``api_key`` lets a caller pass a BYOK key; when omitted the client uses the
    platform-owned credentials from settings.
    """
    if provider == 'adzuna':
        from .adzuna import AdzunaClient
        return AdzunaClient(api_key=api_key)
    if provider == 'jsearch':
        from .jsearch import JSearchClient
        return JSearchClient(api_key=api_key)
    raise ProviderError(f'Unknown provider: {provider}')


__all__ = ['NormalizedPosting', 'ProviderClient', 'ProviderError', 'get_client']
