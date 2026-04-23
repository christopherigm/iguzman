'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Spinner } from '@repo/ui/core-elements/spinner';
import {
  detectPlatform,
  isYoutube,
  type Platform,
} from '@repo/helpers/checkers';
import { stripQueryParams } from '@repo/helpers/clean-url';
import { isIOS, buildResolutionLabel } from './video-item-shared';
import {
  WsClientPanel,
  THIS_DEVICE_UUID,
  type WsClientPanelLabels,
} from './ws-client-panel';
import type { CaptionOption } from '@/app/api/video-metadata/route';
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
    <Box
      className={`df-option-row${disabled ? ' df-option-row--disabled' : ''}`}
    >
      <Typography variant="label" className="df-option-label">
        {label}
      </Typography>
      <Box className="df-option-control">{children}</Box>
    </Box>
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
    <Box className="df-select-wrapper">
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
    </Box>
  );
}

function ResolutionSelect({
  value,
  onChange,
  disabled,
  options,
}: {
  value: number | null;
  onChange: (v: number) => void;
  disabled: boolean;
  options: { value: number; label: string }[];
}) {
  return (
    <Box className="df-select-wrapper">
      <select
        className="df-select"
        value={value ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        aria-label="Resolution"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
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
    </Box>
  );
}

function CaptionSelect({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string | null;
  onChange: (v: string) => void;
  disabled: boolean;
  options: CaptionOption[];
}) {
  return (
    <Box className="df-select-wrapper df-select-wrapper--caption">
      <select
        className="df-select"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Subtitles"
      >
        {options.map((opt) => (
          <option
            key={`${opt.type}-${opt.lang}`}
            value={opt.url}
            style={{ backgroundColor: 'var(--surface-1, #f4f4f5)' }}
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
    </Box>
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
    maxHeight?: number;
    captionsEnabled?: boolean;
    captionUrl?: string;
    /** UUID of the selected ws-client for server FFmpeg, or null for local WASM. */
    wsClientUuid: string | null;
  }) => void;
}

export function DownloadForm({ onVideoAdded }: DownloadFormProps = {}) {
  const t = useTranslations('DownloadForm');
  const [url, setUrl] = useState('');
  const ios = isIOS();
  const [autoDownload, setAutoDownload] = useState(!ios);
  const [justAudio, setJustAudio] = useState(false);
  const [enhance] = useState(false);
  const [fps, setFps] = useState<FPSValue>('original');
  const [showFpsWarning, setShowFpsWarning] = useState(false);

  const [resolutions, setResolutions] = useState<number[]>([]);
  const [selectedResolution, setSelectedResolution] = useState<number | null>(
    null,
  );
  const [metadataLoading, setMetadataLoading] = useState(false);

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [captionsLoading, setCaptionsLoading] = useState(false);
  const [availableCaptions, setAvailableCaptions] = useState<CaptionOption[]>(
    [],
  );
  const [selectedCaptionUrl, setSelectedCaptionUrl] = useState<string | null>(
    null,
  );
  const [captionsUnavailable, setCaptionsUnavailable] = useState(false);

  const [selectedWsClientUuid, setSelectedWsClientUuid] = useState<
    string | null
  >(null);

  const fpsOptions = useMemo(
    () => [
      { value: 'original' as FPSValue, label: t('fpsOriginal') },
      { value: '60' as FPSValue, label: t('fps60') },
      { value: '90' as FPSValue, label: t('fps90') },
      { value: '120' as FPSValue, label: t('fps120') },
    ],
    [t],
  );

  /* Paste from clipboard when the URL input is focused */
  const handleInputFocus = useCallback(async () => {
    if (url) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (isValidUrl(text)) {
        setUrl(stripQueryParams(text));
      }
    } catch {
      // Clipboard permission denied — silently ignore
    }
  }, [url]);

  /* Fetch available resolutions for YouTube URLs (debounced) */
  useEffect(() => {
    setCaptionsUnavailable(false);

    if (!isValidUrl(url) || !isYoutube(url)) {
      setResolutions([]);
      setSelectedResolution(null);
      setMetadataLoading(false);
      return;
    }

    setMetadataLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/video-metadata?url=${encodeURIComponent(url)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { heights?: number[] };
          const heights = data.heights ?? [];
          setResolutions(heights);
          setSelectedResolution(heights[0] ?? null);
        }
      } catch {
        /* best-effort */
      } finally {
        setMetadataLoading(false);
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      setMetadataLoading(false);
    };
  }, [url]);

  /* Fetch available captions when the switch is enabled and URL is valid */
  useEffect(() => {
    if (!captionsEnabled || !isValidUrl(url)) {
      setAvailableCaptions([]);
      setSelectedCaptionUrl(null);
      setCaptionsLoading(false);
      return;
    }

    setCaptionsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/video-metadata?url=${encodeURIComponent(url)}&exhaustive=true`,
        );
        if (res.ok) {
          const data = (await res.json()) as { captions?: CaptionOption[] };
          const captions = data.captions ?? [];
          if (captions.length === 0) {
            setCaptionsEnabled(false);
            setCaptionsUnavailable(true);
          } else {
            setAvailableCaptions(captions);
            const preferred = captions.find(
              (c) => /orig/i.test(c.lang) || /orig/i.test(c.label),
            );
            setSelectedCaptionUrl((preferred ?? captions[0])?.url ?? null);
          }
        }
      } catch {
        /* best-effort */
      } finally {
        setCaptionsLoading(false);
      }
    }, 800);

    return () => {
      clearTimeout(timer);
      setCaptionsLoading(false);
    };
  }, [captionsEnabled, url]);

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
  // const _enhanceDisabled = switchesDisabled || justAudio;
  const fpsDisabled = switchesDisabled || justAudio;
  const captionsDisabled = switchesDisabled || justAudio || captionsUnavailable;

  /* Effective values (justAudio overrides enhance & fps) */
  const effectiveEnhance = justAudio ? false : enhance;
  const effectiveFps: FPSValue = justAudio ? 'original' : fps;

  /* Handlers */
  const handleClear = useCallback(() => {
    setUrl('');
  }, []);

  const submitDownload = useCallback(() => {
    onVideoAdded?.({
      originalURL: url,
      platform,
      fps: effectiveFps,
      justAudio,
      enhance: effectiveEnhance,
      autoDownload,
      ...(selectedResolution != null && { maxHeight: selectedResolution }),
      captionsEnabled: captionsEnabled && !justAudio,
      ...(captionsEnabled &&
        !justAudio &&
        selectedCaptionUrl && { captionUrl: selectedCaptionUrl }),
      wsClientUuid:
        !selectedWsClientUuid || selectedWsClientUuid === THIS_DEVICE_UUID
          ? null
          : selectedWsClientUuid,
    });

    /* Reset the URL field after submission */
    setUrl('');
  }, [
    url,
    justAudio,
    autoDownload,
    effectiveFps,
    effectiveEnhance,
    platform,
    selectedResolution,
    captionsEnabled,
    selectedCaptionUrl,
    onVideoAdded,
  ]);

  const handleSubmit = useCallback(() => {
    if (!validPlatformUrl) return;

    if (effectiveFps !== 'original') {
      setShowFpsWarning(true);
      return;
    }

    submitDownload();
  }, [validPlatformUrl, effectiveFps, submitDownload]);

  const handleFpsWarningCancel = useCallback(() => {
    setShowFpsWarning(false);
    setFps('original');
  }, []);

  const handleFpsWarningOk = useCallback(() => {
    setShowFpsWarning(false);
    submitDownload();
  }, [submitDownload]);

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

  const wsClientLabels: WsClientPanelLabels = {
    thisDevice: t('thisDevice'),
    addServer: t('addServer'),
    deleteServer: t('deleteServer'),
    addServerTitle: t('addServerTitle'),
    addServerText: t('addServerText'),
    wsClientUuidLabel: t('wsClientUuidLabel'),
    wsClientNameLabel: t('wsClientNameLabel'),
    deleteServerTitle: t('deleteServerTitle'),
    deleteServerText: (label) => t('deleteServerText', { label }),
  };

  const formContent = (
    <Box
      elevation={4}
      borderRadius={16}
      padding={10}
      flexDirection="column"
      width="100%"
      backgroundColor="var(--surface-1, #fff)"
    >
      {/* ── URL Input Row ────────────────────────────── */}
      <Box className="df-input-row">
        {platform !== 'unknown' ? (
          <Box
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
          </Box>
        ) : null}

        <Box className="df-input-wrapper">
          <TextInput
            value={url}
            onChange={(v: string) => setUrl(stripQueryParams(v))}
            onFocus={handleInputFocus}
            label={t('inputLabel')}
          />
        </Box>

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
          type="submit"
          className="df-icon-btn df-icon-btn--download"
          disabled={!validPlatformUrl}
          aria-label={t('download')}
        >
          <Icon
            icon="/icons/download.svg"
            size={18}
            color="var(--accent-foreground, white)"
          />
        </button>
      </Box>

      {/* ── Hint ─────────────────────────────────────── */}
      <Typography
        variant="caption"
        className={`df-hint df-hint--${hint.variant}`}
      >
        {hint.text}
      </Typography>

      {/* ── Divider ──────────────────────────────────── */}
      <hr className="df-divider" />

      {/* ── Options ──────────────────────────────────── */}
      <Box className="df-options">
        {!ios && (
          <OptionRow label={t('autoDownload')} disabled={switchesDisabled}>
            <Switch
              checked={autoDownload}
              onChange={switchesDisabled ? undefined : setAutoDownload}
            />
          </OptionRow>
        )}

        {(resolutions.length > 0 || metadataLoading) && (
          <OptionRow
            label={t('resolution')}
            disabled={switchesDisabled || metadataLoading || justAudio}
          >
            {metadataLoading ? (
              <Spinner size={18} thickness={2} label={t('resolution')} />
            ) : (
              <ResolutionSelect
                value={selectedResolution}
                onChange={setSelectedResolution}
                disabled={switchesDisabled || justAudio}
                options={resolutions.map((h) => ({
                  value: h,
                  label: buildResolutionLabel(h),
                }))}
              />
            )}
          </OptionRow>
        )}

        <OptionRow
          label={t('checkForCaptions')}
          disabled={captionsDisabled || captionsLoading}
        >
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            gap={20}
          >
            <Switch
              checked={captionsEnabled}
              onChange={captionsDisabled ? undefined : setCaptionsEnabled}
            />
            {captionsEnabled && captionsLoading ? (
              <Spinner size={18} thickness={2} label={t('captionsLoading')} />
            ) : captionsEnabled && availableCaptions.length > 0 ? (
              <CaptionSelect
                value={selectedCaptionUrl}
                onChange={setSelectedCaptionUrl}
                disabled={captionsDisabled}
                options={availableCaptions}
              />
            ) : null}
          </Box>
        </OptionRow>

        <OptionRow label={t('justAudio')} disabled={switchesDisabled}>
          <Switch
            checked={justAudio}
            onChange={switchesDisabled ? undefined : setJustAudio}
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

        {effectiveFps !== 'original' && (
          <OptionRow label={t('server')} disabled={false}>
            <WsClientPanel
              showManagement
              onChange={setSelectedWsClientUuid}
              labels={wsClientLabels}
            />
          </OptionRow>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      {/* Wrapping in a <form> lets the browser submit on Enter key. */}
      <Box maxWidth={400} width="100%">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          {formContent}
        </form>
      </Box>

      {/* ── FPS Boost Confirmation Modal ──────────── */}
      {showFpsWarning ? (
        <ConfirmationModal
          title={t('fpsBoostTitle')}
          text={t('fpsBoostText', { fps: effectiveFps })}
          okCallback={handleFpsWarningOk}
          cancelCallback={handleFpsWarningCancel}
        />
      ) : null}
    </>
  );
}

export default DownloadForm;
