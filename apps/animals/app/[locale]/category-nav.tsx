import type { CSSProperties } from 'react';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { KINDS, type Category, type Kind } from '@/lib/catalog';
import { localized } from '@/lib/i18n-field';
import './category-nav.css';

/**
 * The catalog's sub-categories as one field of icon tiles.
 *
 * **Fixed-width tiles in a centred wrap container, not a `Grid`.** A 12-column
 * grid forces a fixed *count* per row (`size={{ xs: 4, sm: 3, md: 2 }}`), so
 * tiles stretched to whatever a twelfth of the container happened to be and a
 * long branch left a half-empty second row. These are small, uniform objects:
 * give each one a constant width and let `flex-wrap` fit as many per row as the
 * viewport allows, then spill the rest onto the next line.
 *
 * **One container, no per-branch rows.** The five top-level branches
 * (`KIND_CHOICES` in the API) used to get a wrap container each, which broke a
 * short catalog into five ragged half-rows. They now share a single wrap, so the
 * tiles pack tight and the block reads as one object; the branch survives only
 * as colour - a muted field-guide hue (`KIND_ACCENTS`) shown twice per tile, as
 * the art box's border and as a dashed underline beneath the name. Tiles are
 * still emitted in `KINDS` order, so a branch's tiles stay adjacent and the
 * colours cluster rather than scatter.
 *
 * Each tile links to `/[locale]/categories/[slug]`, which is the category detail
 * page - the destination this component was written ahead of.
 */

/** Art box edge, in px. Square, so the 1:1 crop needs no aspect-ratio. */
const ICON_SIZE = 84;

/**
 * Tile width from `sm` up. Wider than the icon so a two-word name wraps inside
 * its own tile rather than widening it - a constant width is what keeps the rows
 * aligned. Kept close to `ICON_SIZE` so the icons read as a set rather than as
 * marks marooned in their own columns.
 *
 * Below `sm` this is *not* the width: 3 x 116 px plus two 12 px gutters is
 * 372 px, so a 360 px phone fit two tiles per row and the field read as a
 * column. The tile and the column gutter are therefore published as
 * `--tile-width` / `--tile-gap` and `category-nav.css` re-points both inside
 * `@media (--below-sm)`, where the width becomes a fluid third of the row - see
 * the note there. The values here stay the defaults for every other band.
 */
const TILE_WIDTH = 116;

/** Column gutter from `sm` up; `--below-sm` tightens it (see above). */
const TILE_GAP = 12;

/**
 * One muted hue per branch - tawny, moss, rust, dusk and slate: a naturalist's
 * palette rather than five saturated category colours. Each is a midtone, so
 * the same value carries on both the light and the dark page background (the
 * tints below are mixed against `--border`/`transparent`, which do flip).
 *
 * They are deliberately *not* palette tokens: the site's accent is chosen per
 * site in `/admin`, and five branch colours derived from it would collapse into
 * five shades of the same thing.
 */
const KIND_ACCENTS: Record<Kind, string> = {
  animal: '#a8722e',
  plant: '#5f8a4e',
  fungus: '#9e4a3e',
  season: '#8c7ba6',
  weather: '#5c82a8',
};

interface Props {
  categories: Category[];
  locale: string;
}

export async function CategoryNav({ categories, locale }: Props) {
  const t = await getTranslations('HomePage');

  // One flat list, ordered by `KINDS` rather than by the payload: the branches
  // no longer get a row each, so this ordering is the only thing keeping a
  // branch's tiles (and therefore its colour) together as categories are added.
  const ordered = KINDS.flatMap((kind) =>
    categories.filter((category) => category.kind === kind),
  );

  if (ordered.length === 0) return null;

  return (
    <Box flexDirection="column" alignItems="center" gap={28} width="100%">
      <Box flexDirection="column" alignItems="center" gap={8}>
        <Typography as="h2" variant="h2" fontWeight={700} textAlign="center">
          {t('categoriesTitle')}
        </Typography>
        <Typography
          variant="body"
          textAlign="center"
          color="var(--foreground-muted, #6b7280)"
        >
          {t('categoriesSubtitle')}
        </Typography>
      </Box>

      {/* One wrap container for the whole catalog: every tile packs into the
          same field and only the colour says which branch it belongs to.
          `alignItems: flex-start` so a tile whose name wraps to two lines
          doesn't stretch its whole row to match.

          The column gutter reads `--tile-gap` so the mobile override in the
          stylesheet moves the gutter and the tile width together - the fluid
          width there is `(100% - 2 * --tile-gap) / 3`. */}
      <Box
        className="category-nav__field"
        flexWrap="wrap"
        justifyContent="center"
        alignItems="flex-start"
        gap={`18px var(--tile-gap, ${TILE_GAP}px)`}
        width="100%"
      >
        {ordered.map((category) => (
          <CategoryTile
            key={category.id}
            category={category}
            locale={locale}
            accent={KIND_ACCENTS[category.kind]}
          />
        ))}
      </Box>
    </Box>
  );
}

function CategoryTile({
  category,
  locale,
  accent,
}: {
  category: Category;
  locale: string;
  accent: string;
}) {
  const name = localized(category, 'name', locale) ?? category.slug;
  // The `icon` is the mark drawn to stay legible at this size; `image` is a
  // photograph and only stands in when no icon was uploaded.
  const art = category.icon ?? category.image;

  return (
    <Box
      href={`/${locale}/categories/${category.slug}`}
      prefetch
      className="category-nav__tile"
      // Read through a custom property rather than set flat, so the `--below-sm`
      // rule in the stylesheet can swap in a fluid third of the row without
      // fighting this inline width (which would otherwise win the cascade).
      width={`var(--tile-width, ${TILE_WIDTH}px)`}
      flexDirection="column"
      alignItems="center"
      gap={6}
      borderRadius={12}
      color="inherit"
      // The branch colour is published once here as a custom property and read
      // by every descendant - including the hover rules in the stylesheet,
      // which have no other way to know which of the five this tile belongs to.
      styles={{ textDecoration: 'none', '--kind-accent': accent } as CSSProperties}
    >
      {/* One square box either way, so the icon and the letter fallback crop,
          round and hover identically. `overflow: hidden` is what makes the
          image take the box's corners. */}
      <Box
        className="category-nav__art"
        width={ICON_SIZE}
        height={ICON_SIZE}
        alignItems="center"
        justifyContent="center"
        borderRadius={20}
        border="1px solid color-mix(in srgb, var(--kind-accent) 45%, var(--border))"
        backgroundColor={
          art
            ? 'var(--surface-1, var(--background))'
            : 'color-mix(in srgb, var(--kind-accent) 15%, transparent)'
        }
        styles={{ overflow: 'hidden' }}
      >
        {art ? (
          <Image
            src={art}
            alt=""
            width={ICON_SIZE}
            height={ICON_SIZE}
            style={{ objectFit: 'cover', height: '100%', width: '100%' }}
          />
        ) : (
          // `as="span"`: `variant` defaults the element too, so an unqualified
          // `h3` would put one bare letter per tile into the heading outline.
          <Typography
            as="span"
            variant="h3"
            fontWeight={700}
            color="var(--kind-accent)"
            aria-hidden
          >
            {name.charAt(0).toUpperCase()}
          </Typography>
        )}
      </Box>

      {/* The tile centres its cross axis, so this block shrinks to its own text
          and the dashed rule underlines the name rather than the whole tile -
          which is the difference between a field-guide mark and a divider. */}
      <Typography
        variant="caption"
        textAlign="center"
        fontWeight={600}
        className="category-nav__label"
        paddingBottom={3}
        styles={{
          lineHeight: 1.3,
          borderBottom:
            '2px dashed color-mix(in srgb, var(--kind-accent) 60%, transparent)',
        }}
      >
        {name}
      </Typography>
    </Box>
  );
}
