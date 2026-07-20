"""Estimate an ingredient's purchase price from the open web, and find providers.

The admin CMS's ingredient form has a "Search price on web" button; it posts the
ingredient's identity (name / en_name) and its measurement basis (``100 g``,
``1 pc``, …) plus the target ``currency`` here. This module:

  1. builds a shopping-oriented web-search query,
  2. gathers search results *with their URLs* via ``core.services.scraper`` so
     each provider can be linked back to its source page,
  3. has the LLM (a) estimate ONE representative price for the requested amount
     in the requested currency and (b) extract the provider sources (store name,
     URL, quoted price + currency) it saw, and
  4. coerces every price to a clean ``Decimal`` and keeps only providers whose URL
     actually appeared in the search results (no invented links).

Everything is best-effort: an all-empty result (no price, no providers) is normal
and simply means the operator applies nothing.
"""
import logging
from decimal import Decimal, InvalidOperation

from core.models import CURRENCY_CHOICES
from core.services.llm import chat_json
from core.services.scraper import search_results

from ..models import QUANTITY_UNIT_CHOICES

logger = logging.getLogger(__name__)

_UNIT_LABELS = dict(QUANTITY_UNIT_CHOICES)
_CURRENCY_CODES = {c[0] for c in CURRENCY_CHOICES}

# DecimalField(max_digits=12, decimal_places=2) → largest storable value.
_MAX_VALUE = Decimal('9999999999.99')

# Cap the raw text handed to the LLM so a fat result set can't blow the context
# window or the token bill.
_MAX_INPUT_CHARS = 6000


def _build_query(name: str, en_name: str, basis: str, unit_label: str, currency: str) -> str:
    """A web-search query biased toward retail listings that quote a price."""
    food = en_name or name
    return (
        f'buy {food} price per {basis} {unit_label} {currency} - '
        'grocery, supermarket, store, supplier cost'
    )


def _system_prompt(basis: str, unit_label: str, currency: str) -> str:
    return f"""\
You are a grocery/retail price-research assistant.

You are given web search results (title, url, snippet) gathered for a single food \
ingredient. From them, do two things:

1. ESTIMATE ONE representative purchase price for {basis} {unit_label} of this \
ingredient, expressed in {currency}. Web listings quote all sorts of pack sizes \
and currencies - convert each to {basis} {unit_label} in {currency} before \
comparing, then report one sensible typical value. Use null if the results do not \
support any price.

2. LIST the providers (stores/suppliers) you can actually see selling it. For each \
provider use ONLY a url that appears verbatim in the results above - never invent \
a store or a url. Give the store name, that url, the price it quotes, and that \
price's currency code (use null for price if the snippet does not state one).

Rules:
- Prices are plain numbers (no currency symbols, no thousands separators).
- Currency codes are 3-letter ISO codes (USD, EUR, MXN, …).
- Return ONLY a JSON object with exactly these keys, no markdown, no commentary:
{{"estimated_price": <number|null>, "providers": [{{"name": <string|null>, \
"url": <string>, "price": <number|null>, "currency": <string>}}]}}
"""


def _coerce_price(value) -> Decimal | None:
    """A non-negative in-range Decimal, or None for anything unusable."""
    if value is None:
        return None
    try:
        dec = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    if dec < 0:
        return None
    dec = dec.quantize(Decimal('0.01'))
    if dec > _MAX_VALUE:
        return None
    return dec


def _price_str(dec: Decimal | None) -> str | None:
    return None if dec is None else str(dec)


def _valid_currency(value, default: str) -> str:
    code = str(value or '').strip().upper()
    return code if code in _CURRENCY_CODES else default


def lookup_price(
    name: str = '',
    en_name: str = '',
    unit: str = 'g',
    nutrition_basis_quantity: str = '100',
    currency: str = 'USD',
) -> dict:
    """Estimate an ingredient's price and find its providers from the web.

    Returns ``{'price': <str|None>, 'currency': <str>, 'providers': [...]}`` where
    each provider is ``{'name', 'url', 'price', 'currency'}``. Prices are strings
    (or None). The empty result (no price, no providers) is returned when there is
    no name, no search results, or the LLM could not place the ingredient - never
    raises for those best-effort misses. Network / LLM configuration errors from
    the underlying layers propagate to the caller.
    """
    currency = _valid_currency(currency, 'USD')
    empty = {'price': None, 'currency': currency, 'providers': []}
    if not (name or en_name):
        return empty

    unit_label = _UNIT_LABELS.get(unit, unit)
    basis = str(nutrition_basis_quantity or '100')
    query = _build_query(name.strip(), en_name.strip(), basis, unit_label, currency)
    results = search_results(query)
    if not results:
        logger.info('Price lookup: no web results for %r', query)
        return empty

    known_urls = {r['url'] for r in results}
    sources = '\n\n'.join(
        f"TITLE: {r['title']}\nURL: {r['url']}\nSNIPPET: {r['snippet']}" for r in results
    )

    result = chat_json(
        messages=[
            {'role': 'system', 'content': _system_prompt(basis, unit_label, currency)},
            {
                'role': 'user',
                'content': f'INGREDIENT: {name or en_name}\n\nWEB SEARCH RESULTS:\n'
                f'{sources[:_MAX_INPUT_CHARS]}\n\nReturn the JSON.',
            },
        ],
        temperature=0.0,
    )

    price = _coerce_price(result.get('estimated_price'))
    providers = []
    for prov in (result.get('providers') or []):
        if not isinstance(prov, dict):
            continue
        url = str(prov.get('url') or '').strip()
        # Only keep links the search actually returned - drops any hallucinated URL.
        if url not in known_urls:
            continue
        raw_name = prov.get('name')
        providers.append({
            'name': str(raw_name).strip() if raw_name else None,
            'url': url,
            'price': _price_str(_coerce_price(prov.get('price'))),
            'currency': _valid_currency(prov.get('currency'), currency),
        })

    return {'price': _price_str(price), 'currency': currency, 'providers': providers}
