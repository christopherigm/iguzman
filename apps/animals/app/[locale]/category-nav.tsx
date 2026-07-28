import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Box } from '@repo/ui/core-elements/box';
import { Grid } from '@repo/ui/core-elements/grid';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { KINDS, type Category } from '@/lib/catalog';
import { localized } from '@/lib/i18n-field';
import './category-nav.css';

/**
 * The catalog's sub-categories as a grid of icon buttons, grouped under the
 * five top-level branches (`KIND_CHOICES` in the API - a fixed enum, which is
 * why the branch headings are translated here through next-intl rather than
 * read off the payload's `kind_display`).
 *
 * The tiles are deliberately **buttons with no destination yet**: the category
 * detail route does not exist, and a `Link` to a 404 is worse than a control
 * that visibly does nothing. Give each tile an `href` once that page lands.
 */

const ICON_SIZE = 56;

interface Props {
  categories: Category[];
  locale: string;
}

export async function CategoryNav({ categories, locale }: Props) {
  const t = await getTranslations('HomePage');
  const tKinds = await getTranslations('Kinds');

  // Group in `KINDS` order rather than the payload's, so the five branches
  // always appear in the same sequence even as categories are added.
  const grouped = KINDS.map((kind) => ({
    kind,
    items: categories.filter((category) => category.kind === kind),
  })).filter((group) => group.items.length > 0);

  if (grouped.length === 0) return null;

  return (
    <Box flexDirection="column" gap={40} width="100%">
      <Box flexDirection="column" gap={8}>
        <Typography as="h2" variant="h2" fontWeight={700}>
          {t('categoriesTitle')}
        </Typography>
        <Typography variant="body" color="var(--foreground-muted, #6b7280)">
          {t('categoriesSubtitle')}
        </Typography>
      </Box>

      {grouped.map((group) => (
        <Box key={group.kind} flexDirection="column" gap={16}>
          <Typography as="h3" variant="h4" fontWeight={700} color="var(--accent)">
            {tKinds(group.kind)}
          </Typography>

          <Grid container spacing={2}>
            {group.items.map((category) => (
              <Grid key={category.id} size={{ xs: 4, sm: 3, md: 2 }}>
                <CategoryTile category={category} locale={locale} />
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Box>
  );
}

function CategoryTile({ category, locale }: { category: Category; locale: string }) {
  const name = localized(category, 'name', locale) ?? category.slug;
  // The `icon` is the mark drawn to stay legible at this size; `image` is a
  // photograph and only stands in when no icon was uploaded.
  const art = category.icon ?? category.image;

  return (
    <Button unstyled className="category-nav__tile" title={name} width="100%">
      <Box
        width="100%"
        flexDirection="column"
        alignItems="center"
        gap={8}
        paddingY={16}
        paddingX={8}
        borderRadius={12}
        border="1px solid var(--border)"
        backgroundColor="var(--surface-1, var(--background))"
      >
        {art ? (
          <Image
            src={art}
            alt=""
            width={ICON_SIZE}
            height={ICON_SIZE}
            style={{ objectFit: 'contain', height: ICON_SIZE, width: ICON_SIZE }}
          />
        ) : (
          <Box
            width={ICON_SIZE}
            height={ICON_SIZE}
            borderRadius="50%"
            alignItems="center"
            justifyContent="center"
            backgroundColor="color-mix(in srgb, var(--accent) 15%, transparent)"
            aria-hidden
          >
            <Typography variant="h4" fontWeight={700} color="var(--accent)">
              {name.charAt(0).toUpperCase()}
            </Typography>
          </Box>
        )}

        <Typography
          variant="caption"
          textAlign="center"
          fontWeight={600}
          styles={{ lineHeight: 1.3 }}
        >
          {name}
        </Typography>
      </Box>
    </Button>
  );
}
