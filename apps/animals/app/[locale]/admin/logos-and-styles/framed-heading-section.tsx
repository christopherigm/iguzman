'use client';

import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Box } from '@repo/ui/core-elements/box';
import { Grid } from '@repo/ui/core-elements/grid';
import { Switch } from '@repo/ui/core-elements/switch';
import { Typography } from '@repo/ui/core-elements/typography';

type Props = {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** The brandmark being uploaded right now, if there is one. */
  brandmark?: string;
};

/**
 * "Framed heading" - wraps every page and section heading in a thin outline,
 * with the brandmark in a disc straddling the top edge when one is uploaded.
 *
 * This is the whole of `System.hero_text_frame`. website's equivalent section is
 * a 400-line hero-video composer, because that app paints a video hero with a
 * logo badge, a divider and a six-way overlay; a field journal has none of
 * that - it has headings - so this is the one setting worth exposing rather
 * than a port of the rest.
 *
 * The preview is built from the same two ingredients the site uses (the outline
 * and the brandmark disc) and reads the brandmark being uploaded right now, so
 * what is shown is what will ship after saving.
 */
export function FramedHeadingSection({ values, onChange, brandmark }: Props) {
  const t = useTranslations('Admin');
  const framed = Boolean(values.hero_text_frame);
  const heading = String(values.site_name || t('typographyPreviewHeading'));

  return (
    <Box flexDirection="column" gap={16} paddingTop={32}>
      {/* Matches the pair-group headers AdminForm renders, so this reads as a
          section of the same form rather than a panel bolted onto it. */}
      <Box
        paddingBottom={2}
        styles={{
          borderBottom: '1px solid color-mix(in srgb, var(--foreground) 20%, transparent)',
        }}
      >
        <Typography
          variant="label"
          fontWeight={800}
          color="var(--foreground)"
          styles={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          {t('framedHeadingTitle')}
        </Typography>
      </Box>

      <Typography variant="body" margin={0}>
        {t('framedHeadingIntro')}
      </Typography>

      {/* spacing is in 8px base units, not px - 3 is the 24px gutter. */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={12}>
            <Box display="flex" alignItems="center" gap={10}>
              <Switch
                checked={framed}
                onChange={(v) => onChange('hero_text_frame', v)}
                aria-label={t('framedHeadingEnabled')}
              />
              <Typography as="span" variant="body" fontWeight={500} color="var(--foreground)">
                {t('framedHeadingEnabled')}
              </Typography>
            </Box>
            {!brandmark && (
              <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
                {t('framedHeadingNoBrandmark')}
              </Typography>
            )}
          </Box>
        </Grid>

        <Grid size={{ xs: 12, sm: 6 }}>
          <Box flexDirection="column" gap={8}>
            <Typography as="span" variant="label" fontWeight={600} color="var(--foreground)">
              {t('framedHeadingPreview')}
            </Typography>
            <Box
              padding="32px 20px 20px"
              borderRadius={10}
              backgroundColor="var(--surface-2)"
              alignItems="center"
              justifyContent="center"
            >
              <Box
                padding={framed ? '20px 24px' : 0}
                borderRadius={framed ? 8 : 0}
                border={
                  framed
                    ? '1px solid color-mix(in srgb, var(--foreground) 45%, transparent)'
                    : undefined
                }
                styles={{ position: 'relative' }}
              >
                {/* The disc straddles the top edge, half in and half out - which
                    is why it is absolutely positioned rather than being the
                    frame's first child. */}
                {framed && brandmark && (
                  <Box
                    width={44}
                    height={44}
                    borderRadius="50%"
                    backgroundColor="var(--surface-2)"
                    alignItems="center"
                    justifyContent="center"
                    styles={{
                      position: 'absolute',
                      top: -22,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      overflow: 'hidden',
                    }}
                  >
                    <Image src={brandmark} alt="" width={34} height={34} unoptimized />
                  </Box>
                )}
                <Typography as="span" variant="h4" margin={0} textAlign="center">
                  {heading}
                </Typography>
              </Box>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
