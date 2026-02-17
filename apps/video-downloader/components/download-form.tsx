'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { httpPost, HttpClientError } from '@repo/helpers/http-client';
import { detectPlatform, type Platform } from '@repo/helpers/checkers';
import type {
  DownloadVideoResult,
  DownloadVideoError,
} from '@repo/helpers/download-video';
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
  youtube: '/icons/youtube-168-svgrepo-com.svg',
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
          <option key={opt.value} value={opt.value}>
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

interface ApiSuccessResponse {
  data: DownloadVideoResult;
}

interface ApiErrorResponse {
  error: DownloadVideoError;
}

export function DownloadForm() {
  const t = useTranslations('DownloadForm');
  const [url, setUrl] = useState('');
  const [autoDownload, setAutoDownload] = useState(true);
  const [justAudio, setJustAudio] = useState(false);
  const [enhance, setEnhance] = useState(false);
  const [fps, setFps] = useState<FPSValue>('original');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const switchesDisabled = !validPlatformUrl || loading;
  const enhanceDisabled = switchesDisabled || justAudio;
  const fpsDisabled = switchesDisabled || justAudio;

  /* Effective values (justAudio overrides enhance & fps) */
  const effectiveEnhance = justAudio ? false : enhance;
  const effectiveFps: FPSValue = justAudio ? 'original' : fps;

  /* Handlers */
  const handleClear = useCallback(() => {
    setUrl('');
    setErrorMessage(null);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!validPlatformUrl || loading) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await httpPost<ApiSuccessResponse>({
        baseUrl: window.location.origin,
        url: '/api/download-video',
        body: { url, justAudio },
      });

      const { file, name } = result.data.data;
      console.log('Download success:', { file, name });

      if (autoDownload && file) {
        const link = document.createElement('a');
        link.href = `/api/media/${file}`;
        link.download = name ?? file;
        link.click();
      }
    } catch (err) {
      if (err instanceof HttpClientError) {
        const body = err.data as ApiErrorResponse | null;
        setErrorMessage(body?.error?.message ?? err.message);
      } else {
        setErrorMessage(t('errorGeneric'));
      }
    } finally {
      setLoading(false);
    }
  }, [url, justAudio, autoDownload, validPlatformUrl, loading, t]);

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
    >
      {/* ── URL Input Row ────────────────────────────── */}
      <div className="df-input-row">
        {platform !== 'unknown' ? (
          <div
            className={`df-platform-badge${knownPlatform ? ' df-platform-badge--active' : ''}`}
          >
            <Icon
              icon={platformIcon}
              size={18}
              color={
                knownPlatform
                  ? 'var(--accent, #06b6d4)'
                  : 'var(--foreground, #888)'
              }
            />
          </div>
        ) : null}

        <div className="df-input-wrapper">
          <TextInput
            value={url}
            onChange={setUrl}
            lable={t('inputLabel')}
            disabled={loading}
          />
        </div>

        <button
          type="button"
          className="df-icon-btn"
          onClick={handleClear}
          disabled={!hasText || loading}
          aria-label={t('clearUrl')}
        >
          <Icon
            icon="/icons/delete.svg"
            size={18}
            color="var(--foreground, #171717)"
          />
        </button>

        <button
          type="button"
          className="df-icon-btn df-icon-btn--download"
          onClick={handleDownload}
          disabled={!validPlatformUrl || loading}
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

      {/* ── Loading indicator ────────────────────────── */}
      {loading ? <ProgressBar margin="4px 0" /> : null}

      {/* ── Error message ────────────────────────────── */}
      {errorMessage ? (
        <span className="df-hint df-hint--error">{errorMessage}</span>
      ) : null}

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
