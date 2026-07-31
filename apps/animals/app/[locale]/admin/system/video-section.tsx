'use client';

import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Select } from '@repo/ui/core-elements/select';
import { Slider } from '@repo/ui/core-elements/slider';

/**
 * How an uploaded clip is re-encoded before it is stored.
 *
 * These are read by the handler in `apps/animals`' own `/api/video/upload` route
 * at the moment it transcodes, so a change here applies to the **next** upload.
 * Nothing is re-encoded retroactively, and it could not be: the source file is
 * deleted as soon as its transcode lands, which is the point of the pipeline.
 *
 * Two decisions worth knowing about:
 *
 * - **Quality is a slider over CRF, labelled by outcome rather than by number.**
 *   The scale is inverted - CRF 20 is better than CRF 29 - so an author dragging
 *   a control labelled "20 → 29" would reasonably read it backwards. The stored
 *   value is still the CRF the encoder wants; only the label is translated.
 * - **The codec picker carries a warning, and it is not decoration.** HEVC files
 *   are roughly 30% smaller, but playback depends on hardware decode support:
 *   Safari is reliable, Chrome and Edge are conditional, Firefox largely cannot
 *   play them at all. Choosing it trades storage for readers who see nothing.
 */

const HEIGHTS = [720, 1080, 1440, 2160];

/**
 * The four quality steps, as the CRF each becomes. Mirrors the `video_quality`
 * choices on animals-api's `System` - the API validates against that list, so a
 * value added here without being added there is rejected on save.
 */
const QUALITY_STEPS = [20, 23, 26, 29];

interface VideoSectionProps {
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function VideoSection({ values, onChange }: VideoSectionProps) {
  const t = useTranslations('Admin');

  const codec = String(values.video_codec ?? 'h264');
  const quality = Number(values.video_quality ?? 23);

  return (
    <Box flexDirection="column" gap={16}>
      <Typography as="h3" variant="h4" fontWeight={700}>
        {t('videoTitle')}
      </Typography>
      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {t('videoIntro')}
      </Typography>

      <Box maxWidth={320}>
        <Select
          label={t('videoResolution')}
          value={String(values.video_max_height ?? 1080)}
          onChange={(v) => onChange('video_max_height', Number(v))}
          options={HEIGHTS.map((h) => ({ value: String(h), label: t(`videoHeight_${h}`) }))}
        />
      </Box>
      <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
        {t('videoResolutionHelp')}
      </Typography>

      <Slider
        label={t('videoQuality')}
        value={QUALITY_STEPS.includes(quality) ? quality : 23}
        onChange={(v) => onChange('video_quality', Number(v))}
        steps={QUALITY_STEPS.map((crf) => ({ value: crf, label: t(`videoQuality_${crf}`) }))}
      />
      <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
        {t('videoQualityHelp')}
      </Typography>

      <Box maxWidth={320}>
        <Select
          label={t('videoCodec')}
          value={codec}
          onChange={(v) => onChange('video_codec', v)}
          options={[
            { value: 'h264', label: t('videoCodecH264') },
            { value: 'hevc', label: t('videoCodecHevc') },
          ]}
        />
      </Box>
      {/* Shown only for the choice that has a cost, so it reads as a consequence
          rather than as boilerplate under both options. */}
      <Typography
        variant="caption"
        color={codec === 'hevc' ? 'var(--warning, #b45309)' : 'var(--foreground-muted, #6b7280)'}
      >
        {codec === 'hevc' ? t('videoCodecHevcWarning') : t('videoCodecHelp')}
      </Typography>
    </Box>
  );
}
