'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import { detectPlatform, type Platform } from '@repo/helpers/checkers';
import './download-form.css';

/* ── Constants ──────────────────────────────────────── */

const PLATFORM_ICONS: Record<Platform, string> = {
  facebook: '/icons/facebook.svg',
  instagram: '/icons/instagram.svg',
  pinterest: '/icons/pinterest.svg',
  rednote: '/icons/rednote.svg',
  tidal: '/icons/tidal.svg',
  tiktok: '/icons/tiktok.svg',
  x: '/icons/x.svg',
  youtube: '/icons/youtube.svg',
  unknown: '/icons/url.svg',
};

type FPSValue = 'original' | '60' | '90' | '120';

/* ── Helpers ────────────────────────────────────────── */

function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/* ── Sub-components ─────────────────────────────────── */

function OptionRow({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`df-option-row${disabled ? ' df-option-row--disabled' : ''}`}
    >
      <span className="df-option-label">{label}</span>
      <div className="df-option-control">{children}</div>
    </div>
  );
}

function FPSSelect({
  value,
  onChange,
  disabled,
  options,
}: {
  value: FPSValue;
  onChange: (v: FPSValue) => void;
  disabled: boolean;
  options: { value: FPSValue; label: string }[];
}) {
  return (
    <div className="df-select-wrapper">
      <select
        className="df-select"
        value={disabled ? 'original' : value}
        onChange={(e) => onChange(e.target.value as FPSValue)}
        disabled={disabled}
        aria-label="FPS"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{
              backgroundColor: 'var(--surface-1, #f4f4f5)',
            }}
          >
            {opt.label}
          </option>
        ))}
      </select>
      <span className="df-select-chevron">
        <Icon
          icon="/icons/chevron-down.svg"
          size={14}
          color="var(--foreground, #171717)"
        />
      </span>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────── */

export interface DownloadFormProps {
  /** Called when the user submits a URL — creates a pending entry for VideoGrid. */
  onVideoAdded?: (entry: {
    originalURL: string;
    platform: Platform;
    fps: string;
    justAudio: boolean;
    enhance: boolean;
    autoDownload: boolean;
  }) => void;
}

export function DownloadForm({ onVideoAdded }: DownloadFormProps = {}) {
  const t = useTranslations('DownloadForm');
  const [url, setUrl] = useState('');
  const [autoDownload, setAutoDownload] = useState(true);
  const [justAudio, setJustAudio] = useState(false);
  const [enhance, setEnhance] = useState(false);
  const [fps, setFps] = useState<FPSValue>('original');

  const fpsOptions = useMemo(
    () => [
      { value: 'original' as FPSValue, label: t('fpsOriginal') },
      { value: '60' as FPSValue, label: t('fps60') },
      { value: '90' as FPSValue, label: t('fps90') },
      { value: '120' as FPSValue, label: t('fps120') },
    ],
    [t],
  );

  /* Derived state */
  const hasText = url.length > 0;
  const validUrl = useMemo(() => isValidUrl(url), [url]);
  const platform = useMemo<Platform>(
    () => (validUrl ? detectPlatform(url) : 'unknown'),
    [url, validUrl],
  );
  const knownPlatform = platform !== 'unknown';
  const validPlatformUrl = validUrl && knownPlatform;

  /* Disabled flags */
  const switchesDisabled = !validPlatformUrl;
  const enhanceDisabled = switchesDisabled || justAudio;
  const fpsDisabled = switchesDisabled || justAudio;

  /* Effective values (justAudio overrides enhance & fps) */
  const effectiveEnhance = justAudio ? false : enhance;
  const effectiveFps: FPSValue = justAudio ? 'original' : fps;

  /* Handlers */
  const handleClear = useCallback(() => {
    setUrl('');
  }, []);

  const handleSubmit = useCallback(() => {
    if (!validPlatformUrl) return;

    onVideoAdded?.({
      originalURL: url,
      platform,
      fps: effectiveFps,
      justAudio,
      enhance: effectiveEnhance,
      autoDownload,
    });

    /* Reset the URL field after submission */
    setUrl('');
  }, [
    url,
    justAudio,
    autoDownload,
    validPlatformUrl,
    effectiveFps,
    effectiveEnhance,
    platform,
    onVideoAdded,
  ]);

  /* Hint text below input */
  const hint = useMemo(() => {
    if (!hasText) return { text: t('hintEmpty'), variant: 'muted' };
    if (!validUrl) return { text: t('hintInvalidUrl'), variant: 'error' };
    if (!knownPlatform) return { text: t('hintUnsupported'), variant: 'error' };
    return {
      text: t('hintDetected', {
        platform: platform.charAt(0).toUpperCase() + platform.slice(1),
      }),
      variant: 'success',
    };
  }, [hasText, validUrl, knownPlatform, platform, t]);

  const platformIcon = PLATFORM_ICONS[platform];

  return (
    <Box
      elevation={4}
      borderRadius={16}
      padding={10}
      flexDirection="column"
      styles={{ maxWidth: 400, width: '100%' }}
      backgroundColor="var(--surface-1, #fff)"
    >
      {/* ── URL Input Row ────────────────────────────── */}
      <div className="df-input-row">
        {platform !== 'unknown' ? (
          <div
            className={`df-platform-badge${knownPlatform ? ' df-platform-badge--active' : ''}`}
          >
            <Icon
              icon={platformIcon}
              size={22}
              color={
                knownPlatform
                  ? 'var(--accent, #06b6d4)'
                  : 'var(--foreground, #888)'
              }
            />
          </div>
        ) : null}

        <div className="df-input-wrapper">
          <TextInput value={url} onChange={setUrl} lable={t('inputLabel')} />
        </div>

        {url && (
          <button
            type="button"
            className="df-icon-btn"
            onClick={handleClear}
            disabled={!hasText}
            aria-label={t('clearUrl')}
          >
            <Icon
              icon="/icons/delete.svg"
              size={18}
              color="var(--foreground, #171717)"
            />
          </button>
        )}

        <button
          type="button"
          className="df-icon-btn df-icon-btn--download"
          onClick={handleSubmit}
          disabled={!validPlatformUrl}
          aria-label={t('download')}
        >
          <Icon
            icon="/icons/download.svg"
            size={18}
            color="var(--accent-foreground, white)"
          />
        </button>
      </div>

      {/* ── Hint ─────────────────────────────────────── */}
      <span className={`df-hint df-hint--${hint.variant}`}>{hint.text}</span>

      {/* ── Divider ──────────────────────────────────── */}
      <hr className="df-divider" />

      {/* ── Options ──────────────────────────────────── */}
      <div className="df-options">
        <OptionRow label={t('autoDownload')} disabled={switchesDisabled}>
          <Switch
            checked={autoDownload}
            onChange={switchesDisabled ? undefined : setAutoDownload}
          />
        </OptionRow>

        <OptionRow label={t('justAudio')} disabled={switchesDisabled}>
          <Switch
            checked={justAudio}
            onChange={switchesDisabled ? undefined : setJustAudio}
          />
        </OptionRow>

        <OptionRow label={t('enhance')} disabled={enhanceDisabled}>
          <Switch
            checked={effectiveEnhance}
            onChange={enhanceDisabled ? undefined : setEnhance}
          />
        </OptionRow>

        <OptionRow label={t('fps')} disabled={fpsDisabled}>
          <FPSSelect
            value={effectiveFps}
            onChange={setFps}
            disabled={fpsDisabled}
            options={fpsOptions}
          />
        </OptionRow>
      </div>
    </Box>
  );
}

export default DownloadForm;
