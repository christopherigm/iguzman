/**
 * The plain values behind `HeroReveal` - durations, class names, the loading
 * mark's growth and the spinner's geometry.
 *
 * ⚠ **They live outside `hero-reveal.tsx` because that file is `"use client"`,
 * and `hero.tsx` - which reads several of them - is a server component.** Every
 * export of a client module is a *client reference* to a server importer, not
 * the value itself: passed as a prop it survives (the SSR pass resolves it), but
 * read on the server it is a stub. `HERO_REVEAL_LOGO_GROW` was read on the
 * server, interpolated into the loading mark's size, and came out as
 * `calc(168px * function() { throw ... })` - an invalid declaration, silently
 * dropped, leaving the mark at the logo's full intrinsic size and the constant
 * with no effect at all however it was changed.
 *
 * So: anything a server component reads belongs here, and this module must stay
 * free of React and of `"use client"`. `hero-reveal.tsx` imports from it like
 * anyone else - it does **not** re-export, which would hand a server importer
 * the same stub through a different path.
 */

/**
 * How long the hero takes to open from a closed edge to its full height - and,
 * with it, how long the placeholder's mark takes to glide to where the hero's
 * own logo sits. The two are one movement, so they are one number.
 */
export const HERO_REVEAL_DURATION_MS = 900;

/**
 * How long the slogan/subline/actions take to arrive once the box has finished
 * opening. The logo is not on this clock: it has been on screen since the first
 * frame and only travels (see `HeroReveal`).
 */
export const HERO_REVEAL_CONTENT_DURATION_MS = 700;

/**
 * How long to wait for the video before opening anyway.
 *
 * The reveal is driven by the player reaching *playing*, which is the whole
 * point - a hero that opens on the poster frame would show exactly the flicker
 * this exists to remove. But "playing" is not a promise: a blocked autoplay, a
 * provider outage, an ad-blocked embed or a very slow connection can all leave
 * it unspoken, and a hero that never opens is a landing page with no headline
 * and no call to action. So the wait is bounded, and past this the hero opens on
 * whatever the player has managed to paint.
 */
export const HERO_REVEAL_FALLBACK_MS = 4000;

/** Class the hero puts on its logo, so the reveal can hold it back. */
export const HERO_REVEAL_LOGO_CLASS = "hero-reveal__logo";

/** Class the hero puts on its slogan/subline/actions block. */
export const HERO_REVEAL_TEXT_CLASS = "hero-reveal__text";

/**
 * Class for the light sweep passing over a *plate* while the hero loads (a logo
 * badge): an absolutely positioned band, so it is clipped by whatever shape the
 * badge is cut to.
 */
export const HERO_REVEAL_SHEEN_CLASS = "hero-reveal__sheen";

/**
 * Class for the bright core of the sweep passing over a *bare* mark - a white
 * copy of the logo, swept by a gradient mask, so the glint follows the mark's
 * own silhouette instead of its bounding box. A gradient mask (unlike an image
 * one) is not cross-origin bound, so this works wherever the logo is served
 * from.
 */
export const HERO_REVEAL_SHEEN_MARK_CLASS = "hero-reveal__sheen-mark";

/**
 * Class for the sweep's two darker shoulders over a bare mark - a second copy of
 * the logo, flattened to black and masked either side of the core.
 *
 * ⚠ It is what makes the sweep visible **at all** on a light ground, which a
 * white hero mark over a white page background is: a `filter` can flatten a copy
 * to black or to white but cannot paint a gradient of both, so the two tones
 * have to be two elements. Draw it with the core, never on its own.
 */
export const HERO_REVEAL_SHEEN_SHADE_CLASS = "hero-reveal__sheen-shade";

/**
 * How much bigger than the hero will draw it the loading mark is drawn.
 *
 * ⚠ **It is applied to the mark's authored size, not as a `transform`.** A
 * scaled-up mark keeps the layout box of its *unscaled* self, so the spinner
 * laid out beneath it came out inside the drawn logo. Growing the real box
 * instead makes the growth something the page can lay out around - and costs
 * nothing, because the shrink back to the hero's own size is already measured
 * (`--hero-reveal-logo-scale`, which is simply `1 / this` once both marks are
 * sized from it).
 *
 * ⚠ **`Hero` reads it on the server**, which is why it - and this whole module -
 * sits outside `hero-reveal.tsx`; see the file header before moving it back.
 */
export const HERO_REVEAL_LOGO_GROW = 1.5;

/** Diameter of the spinner under the loading mark, and its track weight. */
export const HERO_REVEAL_SPINNER_SIZE = 32;
export const HERO_REVEAL_SPINNER_THICKNESS = 5;

/**
 * The box that spinner actually occupies, published to the CSS as
 * `--hero-reveal-spinner-box` - which is what the counterweight above the mark
 * is built from, so the two cannot fall out of step and leave the mark off
 * centre. Its gap from the mark is `--hero-reveal-spinner-gap` in the CSS.
 *
 * ⚠ **It is not the diameter.** `Spinner` is content-box, so its border rings
 * the `size` rather than fitting inside it - and a counterweight short by those
 * two borders sat the mark three pixels above the middle of a hero whose whole
 * point is a centred mark.
 */
export const HERO_REVEAL_SPINNER_BOX =
  HERO_REVEAL_SPINNER_SIZE + 2 * HERO_REVEAL_SPINNER_THICKNESS;
