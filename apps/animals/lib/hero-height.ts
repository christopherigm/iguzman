import './hero-height.css';

/**
 * The height of every full-bleed opening band on the public site: the landing's
 * `SpeciesGallery` and the catalog's `DetailHero`.
 *
 * It lives here rather than in either component because the two are meant to
 * occupy exactly the same band - arriving at a species page from a gallery
 * caption should feel like moving *within* one site, and two copies of the same
 * `clamp()` is how that quietly stopped being true.
 *
 * The band opens a page whose substance is below it, so it announces the subject
 * without pushing the description off the first screen.
 *
 * ⚠ **The value is per-breakpoint, so it is a variable, not a literal** - the
 * three overrides live in the `hero-height.css` imported above (which is why the
 * import is here rather than in each consumer: the constant and the rules that
 * give it a value must travel together). The literal below is only the fallback
 * for a build where that stylesheet somehow did not load, and matches the `lg`
 * band. Change the numbers there, not here.
 */
export const HERO_HEIGHT = 'var(--hero-band-height, clamp(340px, 42vw, 520px))';
