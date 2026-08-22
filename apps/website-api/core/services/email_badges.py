"""The tenant's logo and brandmark, baked into circular PNGs for an email.

**Why an image instead of a styled cell.** The header used to draw the white
disc in HTML - a fixed-size `<td>` with `border-radius:50%` and the logo
inside it. Two client behaviours break that, and neither can be fixed from CSS:

- **Forced dark mode.** Gmail's apps and Outlook's dark themes re-colour
  *background colours* they judge to be light. `#ffffff` on that disc is the
  lightest colour there is, so it flips to near-black - and a logo PNG with a
  transparent background (most of them) is then a dark mark on a dark disc.
  `color-scheme: light` and `prefers-color-scheme` overrides only reach Apple
  Mail; the two clients that actually caused this ignore both.
- **Outlook's Word engine ignores `max-width`/`max-height`.** A logo wider or
  taller than the cap rendered at its natural size, pushing the cell out and
  turning the "circle" into an oval or a rounded rectangle.

Compositing the disc into a PNG removes both: no mail client re-colours the
*pixels* of an image, and an `<img>` with explicit `width`/`height` attributes
cannot reflow. The badge is square by construction, so the circle is always a
circle and the white behind the mark is always white.

The result is attached inline under a `cid:`, like the order QR - which also
means it survives the "block remote images" default that would otherwise leave
a hole where the branding is.
"""

from __future__ import annotations

import logging
from email.mime.image import MIMEImage
from io import BytesIO

from django.core.cache import cache
from PIL import Image, ImageDraw, ImageOps

logger = logging.getLogger(__name__)

# Content-IDs the templates reference as `cid:brand-logo` / `cid:brand-mark`.
LOGO_CID = "brand-logo"
BRANDMARK_CID = "brand-mark"

# CSS pixel size each badge is rendered at in the email, and the factor the PNG
# is generated at on top of that so it stays sharp on a phone. The `<img>` is
# sized in CSS pixels, so the retina factor is invisible to the layout.
LOGO_SIZE = 96
BRANDMARK_SIZE = 64
_SCALE = 2

# The mark is fitted so its *diagonal* is this fraction of the diameter - i.e.
# the largest rectangle of its aspect ratio that fits inside the circle, with a
# hair of white left at the corners.
#
# The HTML disc this replaces capped width and height at 90% of the diameter,
# which is not the same thing and is wrong for anything that is not round: a
# square mark at 90% has corners 27% outside the circle, and a wide wordmark at
# 90% overflows the chord at its own height. That was survivable while the disc
# was a *background* - the overflow simply sat on the header colour - and it is
# not survivable now that the disc is the image: the spill would be mark pixels
# with no white behind them. A thin wordmark still comes out near-full-width
# (its diagonal is barely longer than it is), while a square one lands at
# ~1/sqrt(2) of the diameter, which is where an app icon sits in a circular
# avatar.
_INSET = 0.96

# The circle is drawn on a 4x mask and downsampled, because PIL's `ellipse` is
# hard-edged: at 1x the rim is visibly staircased against a coloured header.
_SUPERSAMPLE = 4

# Keyed by the stored file's path, which changes whenever a tenant uploads a new
# logo - so a re-brand is picked up without an explicit invalidation, and the
# week-long TTL only ever expires an entry nothing is asking for any more.
_CACHE_TTL = 60 * 60 * 24 * 7


def _render(field, diameter):
    """The finished badge as PNG bytes: white disc, mark centred, clear corners.

    The corners are left transparent rather than filled with the header colour:
    the same badge then sits correctly on the coloured header *and* on the white
    body, and a client that re-colours the surrounding cell cannot leave a
    mismatched square behind.
    """
    with field.open("rb") as fh:
        data = fh.read()

    with Image.open(BytesIO(data)) as src:
        mark = ImageOps.exif_transpose(src).convert("RGBA")

    # Transparent margins are padding the designer put in the file, not part of
    # the mark - and they would be measured as if they were, shrinking the logo
    # inside the disc by however much empty space the export happened to carry.
    box = mark.getchannel("A").getbbox()
    if box:
        mark = mark.crop(box)

    diagonal = (mark.width ** 2 + mark.height ** 2) ** 0.5
    scale = diameter * _INSET / diagonal
    mark = mark.resize(
        (max(1, round(mark.width * scale)), max(1, round(mark.height * scale))),
        Image.LANCZOS,
    )

    mask = Image.new("L", (diameter * _SUPERSAMPLE, diameter * _SUPERSAMPLE), 0)
    edge = diameter * _SUPERSAMPLE - 1
    ImageDraw.Draw(mask).ellipse((0, 0, edge, edge), fill=255)
    mask = mask.resize((diameter, diameter), Image.LANCZOS)

    badge = Image.new("RGBA", (diameter, diameter), (255, 255, 255, 0))
    badge.paste(Image.new("RGBA", badge.size, (255, 255, 255, 255)), (0, 0), mask)
    badge.alpha_composite(
        mark, ((diameter - mark.width) // 2, (diameter - mark.height) // 2)
    )

    buffer = BytesIO()
    badge.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def _badge(system, field_name, size):
    """The badge for one image field of `system`, or None if there isn't one.

    Best-effort like the emails that use it: an unreadable file (a storage blip,
    an SVG Pillow cannot open) returns None and the template falls back to the
    plain remote-logo markup, rather than costing the recipient their email.
    """
    field = getattr(system, field_name, None) if system else None
    if not field:
        return None

    diameter = size * _SCALE
    key = f"email-badge:{field.name}:{diameter}"
    png = cache.get(key)
    if png is not None:
        return png

    try:
        png = _render(field, diameter)
    except Exception:
        logger.exception("Could not build the email badge for %s", field_name)
        return None

    cache.set(key, png, _CACHE_TTL)
    return png


def brand_badges(system):
    """`{cid: png}` for whichever marks this tenant has set - possibly empty."""
    badges = {}
    logo = _badge(system, "img_logo", LOGO_SIZE)
    if logo:
        badges[LOGO_CID] = logo
    brandmark = _badge(system, "img_brandmark", BRANDMARK_SIZE)
    if brandmark:
        badges[BRANDMARK_CID] = brandmark
    return badges


def badge_context(system):
    """The `cid` refs for `email_base.html`, None where there is no badge.

    The template branches on these: a `None` logo falls back to the linked
    `logo_url` markup, and a `None` brandmark drops the sign-off block entirely
    rather than repeating the header logo at the foot of the email.
    """
    badges = brand_badges(system)
    return {
        "logo_cid": LOGO_CID if LOGO_CID in badges else None,
        "brandmark_cid": BRANDMARK_CID if BRANDMARK_CID in badges else None,
    }


def attach_badges(message, system):
    """Attach this tenant's badges to `message` as inline `cid:` parts."""
    badges = brand_badges(system)
    if not badges:
        return

    for cid, png in badges.items():
        image = MIMEImage(png, "png")
        image.add_header("Content-ID", f"<{cid}>")
        # `inline`, so a client that resolves the cid renders it in place rather
        # than listing the branding as a download the reader has to go find.
        image.add_header("Content-Disposition", "inline", filename=f"{cid}.png")
        message.attach(image)

    # Django nests the text/html alternatives inside a `multipart/mixed`, which
    # leaves an attachment a sibling of the whole body and lets several clients
    # (Outlook worst of all) refuse to resolve the cid. `related` is the subtype
    # that says "this part belongs to that HTML" - without it the badges render
    # as broken images.
    message.mixed_subtype = "related"
