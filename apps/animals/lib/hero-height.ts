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
 */
export const HERO_HEIGHT = 'clamp(340px, 42vw, 520px)';
