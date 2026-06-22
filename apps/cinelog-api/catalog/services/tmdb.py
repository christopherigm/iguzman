import requests
from django.conf import settings

_BASE = 'https://api.themoviedb.org/3'
_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'
# Wide, high-res rendition for the detail-page background wallpaper.
_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280'
_YOUTUBE_WATCH = 'https://www.youtube.com/watch?v='
_CAST_LIMIT = 15


def _headers() -> dict:
    return {
        'Authorization': f'Bearer {settings.TMDB_API_TOKEN}',
        'Accept': 'application/json',
    }


def _pick_trailer(videos: list) -> str:
    """
    Choose the best YouTube trailer URL from a TMDB `videos.results` list.

    Prefers an official "Trailer", then any trailer, then any other YouTube
    video. Returns a watch URL or an empty string when no YouTube clip exists.
    """
    youtube = [v for v in videos if v.get('site') == 'YouTube' and v.get('key')]
    if not youtube:
        return ''

    def rank(v: dict) -> tuple:
        name = (v.get('name') or '').lower()
        is_trailer = v.get('type') == 'Trailer'
        is_official = bool(v.get('official')) or 'official' in name
        return (is_trailer, is_official)

    best = max(youtube, key=rank)
    return f'{_YOUTUBE_WATCH}{best["key"]}'


def fetch_tmdb_extras(tmdb_id: str = '', title: str = '') -> dict:
    """
    Resolve a film's synopsis + trailer from TMDB.

    Identifies the movie by `tmdb_id` when available, otherwise by a title
    search. Returns {'synopsis': str, 'trailer_url': str} - either value may be
    empty, and both are empty on a miss or any network/HTTP error (best-effort).
    """
    empty = {'synopsis': '', 'trailer_url': ''}

    movie_id = tmdb_id
    if not movie_id and title:
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
            return empty
        if not results:
            return empty
        movie_id = str(results[0]['id'])

    if not movie_id:
        return empty

    try:
        detail_resp = requests.get(
            f'{_BASE}/movie/{movie_id}',
            params={'append_to_response': 'videos', 'language': 'en-US'},
            headers=_headers(),
            timeout=10,
        )
        detail_resp.raise_for_status()
        detail = detail_resp.json()
    except Exception:
        return empty

    return {
        'synopsis': (detail.get('overview') or '').strip(),
        'trailer_url': _pick_trailer(detail.get('videos', {}).get('results', [])),
    }


def search_tmdb(title: str, year: int | None = None) -> dict | None:
    """
    Search TMDB by title and fetch full details + credits for the top result.

    When `year` is given it is passed as `primary_release_year` to pin the exact
    version of a remade / re-released title (e.g. 1990 vs 2017 "It").

    Returns a dict with keys: title, director, year, cover_url, backdrop_url,
    tmdb_id, genres (list[str]), cast (list[str]). Returns None on miss or error.
    """
    params = {'query': title, 'language': 'en-US'}
    if year:
        params['primary_release_year'] = year
    try:
        search_resp = requests.get(
            f'{_BASE}/search/movie',
            params=params,
            headers=_headers(),
            timeout=10,
        )
        search_resp.raise_for_status()
        results = search_resp.json().get('results') or []
    except Exception:
        return None

    if not results:
        return None

    return fetch_tmdb_by_id(str(results[0]['id']))


def search_tmdb_candidates(title: str, year: int | None = None, limit: int = 7) -> list[dict]:
    """
    Return the top TMDB search results for a title as lightweight candidates.

    TMDB ranks `/search/movie` by popularity, so the right film can sit below a
    more famous near-namesake. This surfaces the top `limit` results - in TMDB's
    own order - so the Inbox can offer a picker to re-pin the exact match. Only
    the search payload is used (no per-result detail calls), so this stays one
    cheap request.

    Each candidate is a dict with keys: tmdb_id, title, year, cover_url,
    overview. Returns an empty list on a miss or any network/HTTP error.
    """
    params = {'query': title, 'language': 'en-US'}
    if year:
        params['primary_release_year'] = year
    try:
        search_resp = requests.get(
            f'{_BASE}/search/movie',
            params=params,
            headers=_headers(),
            timeout=10,
        )
        search_resp.raise_for_status()
        results = search_resp.json().get('results') or []
    except Exception:
        return []

    candidates = []
    for result in results[:limit]:
        poster = result.get('poster_path', '')
        release_date = result.get('release_date', '')
        candidates.append({
            'tmdb_id': str(result['id']),
            'title': result.get('title', ''),
            'year': int(release_date[:4]) if release_date else None,
            'cover_url': f'{_IMAGE_BASE}{poster}' if poster else '',
            'overview': (result.get('overview') or '').strip(),
        })
    return candidates


def fetch_tmdb_by_id(tmdb_id: str) -> dict | None:
    """
    Fetch full details + credits for a single TMDB movie id.

    Resolves the authoritative metadata for an exact film - used both by the
    top-result path of `search_tmdb` and by the Inbox candidate picker, which
    pins the user-chosen `tmdb_id` directly so a re-search can't drift back to
    the wrong title.

    Returns a dict with keys: title, director, year, cover_url, backdrop_url,
    tmdb_id, genres (list[str]), cast (list[str]). Returns None on error.
    """
    try:
        detail_resp = requests.get(
            f'{_BASE}/movie/{tmdb_id}',
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
    backdrop = detail.get('backdrop_path', '')
    release_date = detail.get('release_date', '')
    year = int(release_date[:4]) if release_date else None

    return {
        'title': detail.get('title', ''),
        'director': director,
        'year': year,
        'cover_url': f'{_IMAGE_BASE}{poster}' if poster else '',
        'backdrop_url': f'{_BACKDROP_BASE}{backdrop}' if backdrop else '',
        'tmdb_id': str(tmdb_id),
        'genres': genres,
        'cast': cast,
    }
