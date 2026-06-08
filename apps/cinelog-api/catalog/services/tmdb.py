import requests
from django.conf import settings

_BASE = 'https://api.themoviedb.org/3'
_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
_CAST_LIMIT = 15


def _headers() -> dict:
    return {
        'Authorization': f'Bearer {settings.TMDB_API_TOKEN}',
        'Accept': 'application/json',
    }


def search_tmdb(title: str) -> dict | None:
    """
    Search TMDB by title and fetch full details + credits for the top result.

    Returns a dict with keys: title, director, year, cover_url, tmdb_id,
    genres (list[str]), cast (list[str]). Returns None on miss or error.
    """
    try:
        search_resp = requests.get(
            f'{_BASE}/search/movie',
            params={'query': title, 'language': 'en-US'},
            headers=_headers(),
            timeout=10,
        )
        search_resp.raise_for_status()
        results = search_resp.json().get('results') or []
    except Exception:
        return None

    if not results:
        return None

    movie_id = results[0]['id']

    try:
        detail_resp = requests.get(
            f'{_BASE}/movie/{movie_id}',
            params={'append_to_response': 'credits', 'language': 'en-US'},
            headers=_headers(),
            timeout=10,
        )
        detail_resp.raise_for_status()
        detail = detail_resp.json()
    except Exception:
        return None

    credits = detail.get('credits', {})
    director = next(
        (p['name'] for p in credits.get('crew', []) if p.get('job') == 'Director'),
        '',
    )
    cast = [p['name'] for p in credits.get('cast', [])[:_CAST_LIMIT]]
    genres = [g['name'] for g in detail.get('genres', [])]
    poster = detail.get('poster_path', '')
    release_date = detail.get('release_date', '')
    year = int(release_date[:4]) if release_date else None

    return {
        'title': detail.get('title', ''),
        'director': director,
        'year': year,
        'cover_url': f'{_IMAGE_BASE}{poster}' if poster else '',
        'tmdb_id': str(movie_id),
        'genres': genres,
        'cast': cast,
    }
