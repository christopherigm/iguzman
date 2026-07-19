"""Look up an ingredient's FDA Nutrition-Facts values from the open web.

The admin CMS's ingredient form has a "Search on web" button; it posts the
ingredient's identity (name / en_name), its nutrition basis (``100 g``, ``1 pc``,
…) and an optional description here. This module:

  1. builds a nutrition-oriented web-search query,
  2. scrapes raw web text via ``core.services.scraper`` (search + fallback
     page-extract),
  3. has the LLM map that messy text onto the 15 nutrient fields, *rescaled to
     the requested basis*, returning ``null`` for anything the sources don't
     support, and
  4. coerces every value to a clean, in-range ``Decimal`` (or ``None``).

Everything is best-effort: the caller applies only the non-null fields, leaving
the operator's existing values untouched for nutrients the web didn't cover.
"""
import logging
from decimal import Decimal, InvalidOperation

from ..models import QUANTITY_UNIT_CHOICES, Ingredient
from core.services.llm import chat_json
from core.services.scraper import scrape_text

logger = logging.getLogger(__name__)

_UNIT_LABELS = dict(QUANTITY_UNIT_CHOICES)

# Each nutrient field paired with the unit its stored value is expressed in
# (mirrors the model's help_text). Handed to the LLM so it returns the value in
# the unit we store, not whatever a source happened to print.
_NUTRIENT_UNITS = {
    'calories': 'kcal',
    'total_fat': 'g',
    'saturated_fat': 'g',
    'trans_fat': 'g',
    'cholesterol': 'mg',
    'sodium': 'mg',
    'total_carbohydrate': 'g',
    'dietary_fiber': 'g',
    'total_sugars': 'g',
    'added_sugars': 'g',
    'protein': 'g',
    'vitamin_d': 'mcg',
    'calcium': 'mg',
    'iron': 'mg',
    'potassium': 'mg',
}

# DecimalField(max_digits=8, decimal_places=2) → largest storable value.
_MAX_VALUE = Decimal('999999.99')

# Cap the raw text handed to the LLM so a fat /extract page can't blow the
# context window or the token bill.
_MAX_INPUT_CHARS = 6000


def _build_query(name: str, en_name: str, description: str) -> str:
    """A web-search query biased toward a nutrition-facts source for the food."""
    parts = [p for p in (name, en_name) if p]
    # A short description can disambiguate ("raw", "cooked", a brand), but a long
    # one just dilutes the query - keep only its first few words.
    if description:
        parts.append(' '.join(description.split()[:8]))
    parts.append('nutrition facts calories protein fat per 100g')
    return ' '.join(parts)


def _system_prompt(basis_quantity: str, unit_label: str) -> str:
    fields = '\n'.join(
        f'- {field} ({_NUTRIENT_UNITS[field]})' for field in Ingredient.NUTRIENT_FIELDS
    )
    return f"""\
You are a food-nutrition data extraction assistant.

You are given raw, messy web text gathered for a single food ingredient. Read it \
and report that ingredient's FDA "Nutrition Facts" values.

CRITICAL - the reference amount:
- Report every value PER {basis_quantity} {unit_label} of the ingredient.
- Web sources usually state nutrition per 100 g, per 100 ml, or per serving. \
  Convert their numbers to the requested {basis_quantity} {unit_label} basis. \
  For example, if a source lists values per 100 g and the requested basis is \
  50 g, halve every number.

Fields to return (with the unit each value must be expressed in):
{fields}

Rules:
- Use a plain number for each field, expressed in the unit shown above (e.g. \
  grams for total_fat, milligrams for sodium, kilocalories for calories).
- Return null for any field the text does not clearly support. NEVER guess or \
  invent a value, and never return 0 to mean "unknown".
- If the text is not about this ingredient at all (a different food, a product \
  listing, an unrelated page), return null for every field.
- Return ONLY a JSON object with exactly these keys: \
{', '.join(Ingredient.NUTRIENT_FIELDS)}. No markdown, no commentary.
"""


def _coerce(value) -> Decimal | None:
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


def lookup_nutrition(
    name: str = '',
    en_name: str = '',
    unit: str = 'g',
    nutrition_basis_quantity: str = '100',
    description: str = '',
) -> dict:
    """Resolve an ingredient's nutrients from the web, scaled to its basis.

    Returns a dict keyed by every field in ``Ingredient.NUTRIENT_FIELDS``; each
    value is a ``Decimal`` when a source supported it or ``None`` otherwise. The
    all-``None`` dict is returned when there is no name, no scrape text, or the
    LLM could not place the food - never raises for those best-effort misses.
    Network / LLM configuration errors from the underlying layers propagate to
    the caller (the view maps them to a clean HTTP error).
    """
    empty = {field: None for field in Ingredient.NUTRIENT_FIELDS}
    if not (name or en_name):
        return empty

    query = _build_query(name.strip(), en_name.strip(), description.strip())
    raw = scrape_text(query)
    if not raw.strip():
        logger.info('Nutrition lookup: no web text for %r', query)
        return empty

    unit_label = _UNIT_LABELS.get(unit, unit)
    basis = str(nutrition_basis_quantity or '100')
    result = chat_json(
        messages=[
            {'role': 'system', 'content': _system_prompt(basis, unit_label)},
            {
                'role': 'user',
                'content': f'INGREDIENT: {name or en_name}\n\nRAW WEB TEXT:\n'
                f'{raw[:_MAX_INPUT_CHARS]}\n\nExtract the nutrition values as JSON.',
            },
        ],
        temperature=0.0,
    )

    return {field: _coerce(result.get(field)) for field in Ingredient.NUTRIENT_FIELDS}
