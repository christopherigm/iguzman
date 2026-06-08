from dataclasses import dataclass, field

from .tmdb import search_tmdb
from .upc import fetch_upc


@dataclass
class MovieData:
    barcode: str
    title: str
    director: str
    year: int | None
    cover_url: str
    tmdb_id: str
    genres: list[str] = field(default_factory=list)
    cast: list[str] = field(default_factory=list)
    format: str = ''


def lookup_barcode(barcode: str) -> MovieData | None:
    """
    Fast path: UPCitemdb → TMDB.

    Returns a MovieData on success or None on any miss (unknown barcode,
    no TMDB result, or network error at either step).
    """
    upc_result = fetch_upc(barcode)
    if not upc_result:
        return None

    clean_title, format_hint = upc_result

    tmdb_result = search_tmdb(clean_title)
    if not tmdb_result:
        return None

    return MovieData(barcode=barcode, format=format_hint, **tmdb_result)
