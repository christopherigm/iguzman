'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { IconButton } from '@repo/ui/core-elements/icon-button';
import { readVideoDuration } from '@/lib/video-upload';
import { MAX_VIDEO_BYTES } from '@/lib/contribute';

/**
 * One optional clip on a contributed entry.
 *
 * ⚠ **Nothing is uploaded here.** Unlike `PhotoPicker`, which downscales each
 * file to a data URL that rides in the submission, this only *holds* the chosen
 * `File`. A clip cannot travel in the submission body - it is measured in GB -
 * so the entry is filed first and the clip is uploaded to its id afterwards (see
 * `reserveSightingVideo`). That is also why there is no preview thumbnail: the
 * poster frame is produced by ffmpeg on the server, not here.
 *
 * Both limits are checked **before** the file is accepted, which is the whole
 * point of checking them in the browser at all: the API and the handler both
 * re-check, but only this copy can refuse a clip without the contributor first
 * spending ten minutes uploading it on cellular data.
 *
 * A browser that cannot read the duration (a real case for some phone
 * containers) yields `null`, and the file is **let through** rather than
 * refused - the handler measures the real bytes and will reject it there. A
 * picker that rejected everything it could not measure would block valid clips
 * on the devices most likely to record them.
 */

export interface PickedVideo {
  file: File;
  durationSeconds: number | null;
}

interface Props {
  video: PickedVideo | null;
  onChange: (video: PickedVideo | null) => void;
  /**
   * The duration cap to enforce, resolved from `MAX_CONTRIBUTION_VIDEO_SECONDS`
   * by the server component that renders this flow. A prop rather than an import
   * because this is a client component - see `DEFAULT_MAX_VIDEO_SECONDS`.
   */
  maxSeconds: number;
}

export function VideoPicker({ video, onChange, maxSeconds }: Props) {
  const t = useTranslations('Contribute');
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | null) => {
    setError(null);
    if (!file) return;

    if (file.size > MAX_VIDEO_BYTES) {
      setError(t('videoTooLarge'));
      if (input.current) input.current.value = '';
      return;
    }

    const durationSeconds = await readVideoDuration(file);
    if (durationSeconds !== null && durationSeconds > maxSeconds) {
      setError(t('videoTooLong', { seconds: maxSeconds }));
      if (input.current) input.current.value = '';
      return;
    }

    onChange({ file, durationSeconds });
  };

  const clear = () => {
    onChange(null);
    setError(null);
    if (input.current) input.current.value = '';
  };

  return (
    <Box flexDirection="column" gap={10}>
      <input
        ref={input}
        type="file"
        accept="video/*"
        aria-hidden="true"
        style={{ display: 'none' }}
        onChange={(e) => void pick(e.target.files?.[0] ?? null)}
      />

      {video ? (
        <Box
          alignItems="center"
          gap={12}
          padding={12}
          borderRadius={10}
          backgroundColor="var(--surface-2, #f3f4f6)"
        >
          <Box flexDirection="column" flex="1 1 0" minWidth={0}>
            <Typography variant="body" fontWeight={600} styles={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {video.file.name}
            </Typography>
            <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
              {formatSize(video.file.size)}
              {video.durationSeconds !== null && ` · ${video.durationSeconds}s`}
            </Typography>
          </Box>
          <IconButton
            icon="/icons/close.svg"
            aria-label={t('videoRemove')}
            kind="error"
            size="sm"
            onClick={clear}
          />
        </Box>
      ) : (
        <Box>
          <Button
            text={t('videoChoose')}
            size="lg"
            type="button"
            onClick={() => input.current?.click()}
          />
        </Box>
      )}

      <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
        {t('videoHelp', { seconds: maxSeconds })}
      </Typography>

      {error && (
        <Typography variant="body" color="var(--error, #ef4444)">
          {error}
        </Typography>
      )}
    </Box>
  );
}

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}
