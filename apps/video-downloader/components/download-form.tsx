'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import { Button } from '@repo/ui/core-elements/button';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import {
  detectPlatform,
  isYoutube,
  type Platform,
} from '@repo/helpers/checkers';
import { stripQueryParams } from '@repo/helpers/clean-url';
import { isIOS, buildResolutionLabel } from './video-item-shared';
import {
  isOPFSSupported,
  getOPFSStorageInfo,
  clearOPFSStorage,
} from '@/lib/opfs';
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

interface DuplicateEntry {
  uuid: string;
  downloadURL: string;
  name: string | null;
}

/* ── Helpers ────────────────────────────────────────── */

function isValidUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isServerPath(url: string | null): url is string {
  if (!url) return false;
  return (
    !url.startsWith('blob:') && (url.startsWith('/') || url.startsWith('http'))
  );
}

function formatStorageUsage(
  usedBytes: number,
  totalBytes: number,
): { used: string; total: string; pct: string } {
  let divisor: number;
  let unit: string;

  if (totalBytes >= 1e9) {
    divisor = 1e9;
    unit = 'GB';
  } else if (totalBytes >= 1e6) {
    divisor = 1e6;
    unit = 'MB';
  } else if (totalBytes >= 1e3) {
    divisor = 1e3;
    unit = 'KB';
  } else {
    divisor = 1;
    unit = 'B';
  }

  const usedValue = usedBytes / divisor;
  const totalValue = totalBytes / divisor;

  const usedStr =
    usedValue === 0
      ? '0'
      : usedValue >= 1
        ? usedValue.toFixed(1)
        : parseFloat(usedValue.toPrecision(2)).toString();

  return {
    used: usedStr,
    total: `${totalValue.toFixed(1)} ${unit}`,
    pct: ((usedBytes / totalBytes) * 100).toFixed(2),
  };
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
    /** Whether to store the downloaded video in the browser's Origin Private File System. */
    opfsEnabled: boolean;
  }) => void;
  /** Completed videos to check against for duplicate detection. */
  completedVideos?: Array<{
    uuid: string;
    originalURL: string;
    downloadURL: string | null;
    name: string | null;
  }>;
  /** Called when the user wants to move an existing completed video to the top of the list. */
  onMoveToFirst?: (uuid: string) => void;
  /** Called after OPFS and completed-video storage have been cleared. */
  onClearStorage?: () => void;
}

export function DownloadForm({
  onVideoAdded,
  completedVideos,
  onMoveToFirst,
  onClearStorage,
}: DownloadFormProps = {}) {
  const t = useTranslations('DownloadForm');
  const [url, setUrl] = useState('');
  const [ios, setIos] = useState(false);
  const [autoDownload, setAutoDownload] = useState(true);
  const [opfsSupported, setOpfsSupported] = useState(false);
  const [opfsEnabled, setOpfsEnabled] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    totalBytes: number;
  } | null>(null);

  useEffect(() => {
    const isIOSDevice = isIOS();
    setIos(isIOSDevice);
    if (isIOSDevice) setAutoDownload(false);
    const supported = isOPFSSupported();
    setOpfsSupported(supported);
    if (supported) {
      const saved = localStorage.getItem('vd-opfs-enabled');
      if (saved !== null) setOpfsEnabled(saved === 'true');
    }
  }, []);

  useEffect(() => {
    if (!opfsSupported) return;
    let cancelled = false;
    const refresh = async () => {
      const info = await getOPFSStorageInfo();
      if (!cancelled) setStorageInfo(info);
    };
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [opfsSupported]);
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

  const [showOpfsConfirm, setShowOpfsConfirm] = useState(false);
  const [showClearStorageConfirm, setShowClearStorageConfirm] = useState(false);

  const [duplicateEntry, setDuplicateEntry] = useState<DuplicateEntry | null>(
    null,
  );

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

  /* Fetch available resolutions for YouTube URLs.
   * Retries up to 20 times with exponential backoff (1 s, 2 s, 4 s … capped at 30 s)
   * on network errors or non-2xx responses. */
  useEffect(() => {
    setCaptionsUnavailable(false);

    if (!isValidUrl(url) || !isYoutube(url)) {
      setResolutions([]);
      setSelectedResolution(null);
      setMetadataLoading(false);
      return;
    }

    const MAX_ATTEMPTS = 20;
    let attempt = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tryFetch = async () => {
      if (cancelled) return;
      setMetadataLoading(true);
      try {
        const res = await fetch(
          `/api/video-metadata?url=${encodeURIComponent(url)}`,
        );
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { heights?: number[] };
        const heights = data.heights ?? [];
        setResolutions(heights);
        setSelectedResolution(heights[0] ?? null);
        setMetadataLoading(false);
      } catch {
        if (cancelled) return;
        attempt += 1;
        if (attempt < MAX_ATTEMPTS) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
          timer = setTimeout(tryFetch, delay);
        } else {
          setMetadataLoading(false);
        }
      }
    };

    /* Initial debounce before the first attempt */
    timer = setTimeout(tryFetch, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setMetadataLoading(false);
    };
  }, [url]);

  /* Fetch available captions when the switch is enabled and URL is valid.
   * Retries up to 20 times with exponential backoff (1 s, 2 s, 4 s … capped at 30 s)
   * on network errors or non-2xx responses. */
  useEffect(() => {
    if (!captionsEnabled || !isValidUrl(url)) {
      setAvailableCaptions([]);
      setSelectedCaptionUrl(null);
      setCaptionsLoading(false);
      return;
    }

    const MAX_ATTEMPTS = 20;
    let attempt = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tryFetch = async () => {
      if (cancelled) return;
      setCaptionsLoading(true);
      try {
        const res = await fetch(
          `/api/video-metadata?url=${encodeURIComponent(url)}&exhaustive=true`,
        );
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        setCaptionsLoading(false);
      } catch {
        if (cancelled) return;
        attempt += 1;
        if (attempt < MAX_ATTEMPTS) {
          const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
          timer = setTimeout(tryFetch, delay);
        } else {
          setCaptionsLoading(false);
        }
      }
    };

    /* Initial debounce before the first attempt */
    timer = setTimeout(tryFetch, 800);

    return () => {
      cancelled = true;
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

  const persistOpfsEnabled = useCallback((value: boolean) => {
    setOpfsEnabled(value);
    localStorage.setItem('vd-opfs-enabled', String(value));
  }, []);

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
      opfsEnabled,
    });

    /* Reset the URL field and captions toggle after submission */
    setUrl('');
    setCaptionsEnabled(false);
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
    opfsEnabled,
  ]);

  const handleSubmit = useCallback(() => {
    if (!validPlatformUrl) return;

    const dupe = completedVideos?.find((v) => v.originalURL === url);
    if (dupe) {
      setDuplicateEntry({
        uuid: dupe.uuid,
        downloadURL: dupe.downloadURL ?? '',
        name: dupe.name,
      });
      return;
    }

    if (effectiveFps !== 'original') {
      setShowFpsWarning(true);
      return;
    }

    submitDownload();
  }, [validPlatformUrl, url, completedVideos, effectiveFps, submitDownload]);

  const handleDuplicateClose = useCallback(() => {
    setDuplicateEntry(null);
  }, []);

  const handleDuplicateDownload = useCallback(() => {
    if (!duplicateEntry) return;
    const a = document.createElement('a');
    a.href = duplicateEntry.downloadURL;
    if (duplicateEntry.name) a.download = duplicateEntry.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDuplicateEntry(null);
  }, [duplicateEntry]);

  const handleDuplicateMoveToFirst = useCallback(() => {
    if (!duplicateEntry) return;
    onMoveToFirst?.(duplicateEntry.uuid);
    setDuplicateEntry(null);
  }, [duplicateEntry, onMoveToFirst]);

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

  const handleClearStorage = useCallback(async () => {
    await clearOPFSStorage();
    try {
      const raw = localStorage.getItem('vd_completed_v2');
      if (raw) {
        const all = JSON.parse(raw) as Array<{ opfsEnabled?: boolean }>;
        const kept = all.filter((v) => !v.opfsEnabled);
        localStorage.setItem('vd_completed_v2', JSON.stringify(kept));
      }
    } catch {
      // Malformed storage — leave it untouched
    }
    setStorageInfo(null);
    setShowClearStorageConfirm(false);
    onClearStorage?.();
  }, [onClearStorage]);

  const platformIcon = PLATFORM_ICONS[platform];

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
          disabled={!validPlatformUrl || captionsLoading}
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
      <Box className="df-options" marginTop={8}>
        <Box display="flex" justifyContent="space-between" gap={12}>
          {opfsSupported && (
            <Box width="50%">
              <OptionRow label={t('saveToDevice')} disabled={switchesDisabled}>
                <Switch
                  checked={opfsEnabled}
                  onChange={
                    switchesDisabled
                      ? undefined
                      : (checked) => {
                          if (checked) {
                            setShowOpfsConfirm(true);
                          } else {
                            persistOpfsEnabled(false);
                          }
                        }
                  }
                />
              </OptionRow>
            </Box>
          )}
          {!ios && (
            <Box width="50%">
              <OptionRow label={t('autoDownload')} disabled={switchesDisabled}>
                <Switch
                  checked={autoDownload}
                  onChange={switchesDisabled ? undefined : setAutoDownload}
                />
              </OptionRow>
            </Box>
          )}
        </Box>
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

      </Box>

      {opfsSupported &&
        storageInfo !== null &&
        storageInfo.usedBytes > 0 &&
        storageInfo.totalBytes > 0 && (
          <>
            <hr className="df-divider" />
            <Box marginTop={8}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                marginBottom={6}
              >
                <Typography
                  variant="caption"
                  color="var(--foreground-muted, #999)"
                >
                  {t('opfsStorageLabel')}
                </Typography>
                <Box display="flex" alignItems="center" gap={6}>
                  <Typography
                    variant="caption"
                    color="var(--foreground-muted, #999)"
                    marginRight={8}
                  >
                    {(() => {
                      const { used, total, pct } = formatStorageUsage(
                        storageInfo.usedBytes,
                        storageInfo.totalBytes,
                      );
                      return t('opfsStorageUsage', { used, total, pct });
                    })()}
                  </Typography>
                  <button
                    type="button"
                    className="df-icon-btn df-icon-btn--download"
                    onClick={() => setShowClearStorageConfirm(true)}
                    aria-label={t('clearStorageLabel')}
                  >
                    <Icon
                      icon="/icons/clear.svg"
                      size={18}
                      color="var(--accent-foreground, white)"
                    />
                  </button>
                </Box>
              </Box>
              <ProgressBar
                value={Math.round(
                  (storageInfo.usedBytes / storageInfo.totalBytes) * 100,
                )}
                size={4}
                label={t('opfsStorageLabel')}
              />
            </Box>
          </>
        )}
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

      {/* ── OPFS Confirmation Modal ──────────────── */}
      {showOpfsConfirm ? (
        <ConfirmationModal
          title={t('opfsConfirmTitle')}
          text={t('opfsConfirmText')}
          okCallback={() => {
            persistOpfsEnabled(true);
            setShowOpfsConfirm(false);
          }}
          cancelCallback={() => setShowOpfsConfirm(false)}
        />
      ) : null}

      {/* ── Clear Storage Confirmation Modal ─────── */}
      {showClearStorageConfirm ? (
        <ConfirmationModal
          title={t('clearStorageTitle')}
          text={t('clearStorageText')}
          okCallback={() => {
            void handleClearStorage();
          }}
          cancelCallback={() => setShowClearStorageConfirm(false)}
        />
      ) : null}

      {/* ── Duplicate Video Modal ─────────────────── */}
      {duplicateEntry ? (
        <ConfirmationModal
          title={t('duplicateTitle')}
          text={t('duplicateText')}
          okCallback={handleDuplicateClose}
          cancelCallback={handleDuplicateClose}
          panelMaxWidth="440px"
        >
          <Box display="flex" flexDirection="column" gap={8}>
            {isServerPath(duplicateEntry.downloadURL) && (
              <Button
                text={t('duplicateDownloadVideo')}
                onClick={handleDuplicateDownload}
                width="100%"
                size="md"
              />
            )}
            <Button
              text={t('duplicateMoveToFirst')}
              onClick={handleDuplicateMoveToFirst}
              width="100%"
              size="md"
              backgroundColor="var(--surface-1, rgba(0,0,0,0.06))"
              color="var(--foreground, #1a1a1a)"
            />
          </Box>
        </ConfirmationModal>
      ) : null}
    </>
  );
}

export default DownloadForm;
