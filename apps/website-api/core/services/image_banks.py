"""image_banks - search a free stock bank for one photo, and say who it is owed to.

Used by the `fetch_seed_images` management command to fill a `/seed-site` brief
with real, on-subject photography instead of the eight generic `placeholder-*`
files, so a landing can be shown to a customer the day it is seeded.

**Only free-license banks live here, deliberately.** Pexels and Pixabay both
license their content for commercial use, which is what lets a seeded image
survive `publish-site` and go live on the customer's real site - the customer
keeps it, at no cost, for as long as they like. A watermarked-comp bank
(Shutterstock, Adobe Stock) could be searched the same way, but its comp licence
covers evaluation only and forbids public display, so its images could never
leave a local preview. Adding one means adding that restriction to every
downstream surface; don't, without deciding that first.

Pexels is primary and Pixabay is the fallback, for two reasons rather than one:
Pexels' library is better curated (its results for a specific dish or trade are
usually usable first try) and its `alt` text gives the operator something to
review the choice by. Pixabay covers the long tail Pexels misses and has a
separate quota, so a rate-limited run degrades instead of failing.

⚠ **Attribution is not optional here even though the licences say it is.** Both
*content* licences waive credit; both *API* terms require it - Pexels asks for a
prominent link to Pexels and the photographer's name where possible. Downloading
the same photo by hand would owe nothing; pulling it through the API does. That
is why every `Photo` carries a credit and why `BasePicture.attribution` exists.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

PEXELS = "pexels"
PIXABAY = "pixabay"

_SEARCH_TIMEOUT = 20
_DOWNLOAD_TIMEOUT = 60
# Enough results to skip the ones already used elsewhere in the same brief
# without paying for a second round-trip. A restaurant seeding 12 pizzas off
# near-identical queries is the case this exists for.
_PER_PAGE = 30
# A bank image is going into an ImageField whose largest tier (LargePicture) caps
# at 1920px, and the serializer resamples anyway - so there is nothing to gain
# from pulling an 8MP original and a lot of transfer to lose.
_PEXELS_SIZE = "large"

# Pexels and Pixabay spell the same three orientations differently.
_ORIENTATION = {
    PEXELS: {"landscape": "landscape", "portrait": "portrait", "square": "square"},
    PIXABAY: {"landscape": "horizontal", "portrait": "vertical", "square": "all"},
}


@dataclass(frozen=True)
class Photo:
    """One search hit: where to download it, and the credit it carries."""

    bank: str
    bank_id: str
    download_url: str
    attribution: str
    attribution_url: str
    # The bank's own description, shown to the operator so a bad match can be
    # spotted without opening the file. Pixabay has no alt text and sends tags.
    alt: str = ""

    @property
    def key(self) -> str:
        """Stable identity for de-duplication across one brief."""
        return f"{self.bank}:{self.bank_id}"


class ImageBankError(RuntimeError):
    """A bank refused, timed out, or is not configured."""


# --------------------------------------------------------------------------- #
# Pexels
# --------------------------------------------------------------------------- #

def _search_pexels(query: str, orientation: str | None) -> list[Photo]:
    if not settings.PEXELS_API_KEY:
        raise ImageBankError("PEXELS_API_KEY is not set")
    params: dict = {"query": query, "per_page": _PER_PAGE}
    if orientation:
        params["orientation"] = _ORIENTATION[PEXELS].get(orientation, orientation)
    resp = requests.get(
        "https://api.pexels.com/v1/search",
        params=params,
        headers={"Authorization": settings.PEXELS_API_KEY},
        timeout=_SEARCH_TIMEOUT,
    )
    resp.raise_for_status()
    photos = []
    for hit in resp.json().get("photos") or []:
        src = hit.get("src") or {}
        url = src.get(_PEXELS_SIZE) or src.get("large") or src.get("original")
        if not url:
            continue
        photographer = (hit.get("photographer") or "").strip()
        photos.append(
            Photo(
                bank=PEXELS,
                bank_id=str(hit.get("id")),
                download_url=url,
                # The exact wording Pexels' own guidelines ask for.
                attribution=(
                    f"Photo by {photographer} on Pexels" if photographer
                    else "Photo on Pexels"
                ),
                # The photo's page, not the photographer's profile: the credit
                # has to lead to the image being credited, which is also where a
                # customer goes to check the licence for themselves.
                attribution_url=hit.get("url") or "",
                alt=(hit.get("alt") or "").strip(),
            )
        )
    return photos


# --------------------------------------------------------------------------- #
# Pixabay
# --------------------------------------------------------------------------- #

def _search_pixabay(query: str, orientation: str | None) -> list[Photo]:
    if not settings.PIXABAY_API_KEY:
        raise ImageBankError("PIXABAY_API_KEY is not set")
    params: dict = {
        "key": settings.PIXABAY_API_KEY,
        "q": query,
        "image_type": "photo",
        "safesearch": "true",
        "per_page": _PER_PAGE,
    }
    if orientation:
        params["orientation"] = _ORIENTATION[PIXABAY].get(orientation, "all")
    resp = requests.get(
        "https://pixabay.com/api/", params=params, timeout=_SEARCH_TIMEOUT
    )
    resp.raise_for_status()
    photos = []
    for hit in resp.json().get("hits") or []:
        # `largeImageURL` is the 1280px render. Pixabay's terms forbid permanent
        # hotlinking and ask that you download to your own server - which is
        # exactly what the caller does, since these land in an ImageField.
        url = hit.get("largeImageURL") or hit.get("webformatURL")
        if not url:
            continue
        user = (hit.get("user") or "").strip()
        photos.append(
            Photo(
                bank=PIXABAY,
                bank_id=str(hit.get("id")),
                download_url=url,
                attribution=(
                    f"Image by {user} on Pixabay" if user else "Image on Pixabay"
                ),
                attribution_url=hit.get("pageURL") or "",
                alt=(hit.get("tags") or "").strip(),
            )
        )
    return photos


_BANKS = {PEXELS: _search_pexels, PIXABAY: _search_pixabay}


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def configured_banks() -> list[str]:
    """The banks that have a key, in preference order."""
    return [
        name
        for name, key in ((PEXELS, settings.PEXELS_API_KEY),
                          (PIXABAY, settings.PIXABAY_API_KEY))
        if key
    ]


def search_photo(
    query: str,
    *,
    orientation: str | None = None,
    exclude: set[str] | None = None,
    banks: list[str] | None = None,
) -> Photo | None:
    """The best unused photo for `query`, or None if no bank had one.

    `exclude` holds `Photo.key`s already spent elsewhere in this run. Without it
    a menu of twelve pizzas seeded from twelve near-identical queries comes back
    as the same top-ranked photo twelve times - which reads to the customer as a
    broken seed rather than a thin search result.
    """
    spent = exclude or set()
    for name in banks or configured_banks():
        try:
            hits = _BANKS[name](query, orientation)
        except (requests.RequestException, ImageBankError, ValueError) as exc:
            # A bank that is down, rate-limited or unconfigured must not fail the
            # whole seed - the next one, and ultimately the placeholder pool,
            # still produce a complete site.
            logger.warning("image_banks: %s failed for %r (%s)", name, query, exc)
            continue
        for photo in hits:
            if photo.key not in spent:
                return photo
    return None


def download(photo: Photo, dest) -> None:
    """Stream a hit to `dest` (a Path). Raises on any HTTP failure."""
    with requests.get(
        photo.download_url, timeout=_DOWNLOAD_TIMEOUT, stream=True
    ) as resp:
        resp.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=64 * 1024):
                fh.write(chunk)
