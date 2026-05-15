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
import { detectPlatform, type Platform } from '@repo/helpers/checkers';
import { stripQueryParams } from '@repo/helpers/clean-url';
import {
  isIOS,
  resolveResolutionLabel,
  buildResolutionLabel,
  PlatformIconBg,
} from './video-item-shared';
import { isOPFSSupported, getOPFSStorageInfo } from '@/lib/opfs';
import { ClearStorageModal } from './clear-storage-modal';
import type { CaptionOption } from '@/app/api/video-metadata/route';
import { Divider } from '@repo/ui/core-elements/divider';
import './platform-icon-bg.css';
import './download-form.css';

/* ── Constants ──────────────────────────────────────── */

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
      <Typography variant="body-sm" fontWeight={500}>
        {label}
      </Typography>
      <Box className="df-option-control">{children}</Box>
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

const SMART_RESOLUTION_OPTIONS: { value: number; label: string }[] = [
  { value: 360, label: buildResolutionLabel(360) },
  { value: 480, label: buildResolutionLabel(480) },
  { value: 720, label: buildResolutionLabel(720) },
  { value: 1080, label: buildResolutionLabel(1080) },
  { value: 1440, label: buildResolutionLabel(1440) },
  { value: 2160, label: buildResolutionLabel(2160) },
];

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
  /** Called after a category of OPFS videos is cleared; receives the UUIDs removed. */
  onRemoveVideosByUuids?: (uuids: string[]) => void;
}

export function DownloadForm({
  onVideoAdded,
  completedVideos,
  onMoveToFirst,
  onRemoveVideosByUuids,
}: DownloadFormProps = {}) {
  const t = useTranslations('DownloadForm');
  const [url, setUrl] = useState('');
  const [ios, setIos] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);
  const [opfsSupported, setOpfsSupported] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    totalBytes: number;
  } | null>(null);

  useEffect(() => {
    const isIOSDevice = isIOS();
    setIos(isIOSDevice);
    if (isIOSDevice) {
      setAutoDownload(false);
    } else {
      const stored = localStorage.getItem('vd_auto_download');
      setAutoDownload(stored !== null ? stored === 'true' : false);
    }
    const supported = isOPFSSupported();
    setOpfsSupported(supported);
    const storedSmart = localStorage.getItem('vd_smart_download');
    setSmartDownload(storedSmart === 'true');
    const storedSmartCaptions = localStorage.getItem('vd_smart_captions');
    setSmartCaptions(storedSmartCaptions !== 'false');
    const storedSmartHeight = localStorage.getItem('vd_smart_max_height');
    setSmartMaxHeight(storedSmartHeight ? Number(storedSmartHeight) : 1080);
  }, []);

  const handleAutoDownloadChange = useCallback((value: boolean) => {
    setAutoDownload(value);
    localStorage.setItem('vd_auto_download', String(value));
  }, []);

  const handleSmartDownloadChange = useCallback((value: boolean) => {
    setSmartDownload(value);
    localStorage.setItem('vd_smart_download', String(value));
  }, []);

  const handleSmartCaptionsChange = useCallback((value: boolean) => {
    setSmartCaptions(value);
    localStorage.setItem('vd_smart_captions', String(value));
  }, []);

  const handleSmartMaxHeightChange = useCallback((value: number) => {
    setSmartMaxHeight(value);
    localStorage.setItem('vd_smart_max_height', String(value));
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [resolutions, setResolutions] = useState<number[]>([]);
  const [widthByHeight, setWidthByHeight] = useState<Record<number, number>>(
    {},
  );
  const [selectedResolution, setSelectedResolution] = useState<number | null>(
    null,
  );
  const [metadataLoading, setMetadataLoading] = useState(false);

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [availableCaptions, setAvailableCaptions] = useState<CaptionOption[]>(
    [],
  );
  const [selectedCaptionUrl, setSelectedCaptionUrl] = useState<string | null>(
    null,
  );
  const [captionsUnavailable, setCaptionsUnavailable] = useState(false);

  const [smartDownload, setSmartDownload] = useState(false);
  const [smartCaptions, setSmartCaptions] = useState(true);
  const [smartMaxHeight, setSmartMaxHeight] = useState(1080);

  const [showClearStorageConfirm, setShowClearStorageConfirm] = useState(false);

  const [duplicateEntry, setDuplicateEntry] = useState<DuplicateEntry | null>(
    null,
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

  /* Fetch resolutions and captions together in a single exhaustive call.
   * Retries up to 20 times with exponential backoff (1 s, 2 s, 4 s … capped at 30 s)
   * on network errors or non-2xx responses. */
  useEffect(() => {
    setCaptionsUnavailable(false);
    setAvailableCaptions([]);
    setSelectedCaptionUrl(null);
    setCaptionsEnabled(false);

    if (!isValidUrl(url) || justAudio || smartDownload) {
      setResolutions([]);
      setWidthByHeight({});
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
          `/api/video-metadata?url=${encodeURIComponent(url)}&exhaustive=true`,
        );
        if (cancelled) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as {
          heights?: number[];
          widthByHeight?: Record<number, number>;
          captions?: CaptionOption[];
        };
        const heights = data.heights ?? [];
        setResolutions(heights);
        setWidthByHeight(data.widthByHeight ?? {});
        setSelectedResolution(heights[0] ?? null);
        const captions = data.captions ?? [];
        if (captions.length === 0) {
          setCaptionsUnavailable(true);
        } else {
          setAvailableCaptions(captions);
          const preferred = captions.find(
            (c) => /orig/i.test(c.lang) || /orig/i.test(c.label),
          );
          setSelectedCaptionUrl((preferred ?? captions[0])?.url ?? null);
          setCaptionsEnabled(true);
        }
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
  }, [url, justAudio, smartDownload]);

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
  const captionsDisabled =
    switchesDisabled || justAudio || captionsUnavailable || metadataLoading;

  /* Effective values (justAudio overrides enhance) */
  const effectiveEnhance = justAudio ? false : enhance;

  /* Handlers */
  const handleClear = useCallback(() => {
    setUrl('');
  }, []);

  const submitDownload = useCallback(() => {
    const effectiveCaptionsEnabled = smartDownload
      ? smartCaptions && !justAudio
      : captionsEnabled && !justAudio;
    const effectiveMaxHeight = smartDownload
      ? !justAudio
        ? smartMaxHeight
        : undefined
      : (selectedResolution ?? undefined);
    const effectiveCaptionUrl =
      !smartDownload && captionsEnabled && !justAudio && selectedCaptionUrl
        ? selectedCaptionUrl
        : undefined;

    onVideoAdded?.({
      originalURL: url,
      platform,
      fps: 'original',
      justAudio,
      enhance: effectiveEnhance,
      autoDownload,
      ...(effectiveMaxHeight != null && { maxHeight: effectiveMaxHeight }),
      captionsEnabled: effectiveCaptionsEnabled,
      ...(effectiveCaptionUrl != null && { captionUrl: effectiveCaptionUrl }),
      opfsEnabled: opfsSupported,
    });

    /* Reset the URL field and captions toggle after submission */
    setUrl('');
    setCaptionsEnabled(false);
  }, [
    url,
    justAudio,
    autoDownload,
    effectiveEnhance,
    platform,
    selectedResolution,
    captionsEnabled,
    selectedCaptionUrl,
    onVideoAdded,
    opfsSupported,
    smartDownload,
    smartCaptions,
    smartMaxHeight,
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

    submitDownload();
  }, [validPlatformUrl, url, completedVideos, submitDownload]);

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

  const handleStorageModalClose = useCallback(async () => {
    setShowClearStorageConfirm(false);
    /* Refresh the storage bar after any category clears */
    const info = await getOPFSStorageInfo();
    setStorageInfo(info);
  }, []);

  const formContent = (
    <Box
      elevation={4}
      borderRadius={16}
      padding={10}
      flexDirection="column"
      width="100%"
      backgroundColor="var(--surface-1, #fff)"
      styles={{
        position: 'relative',
        overflow: 'hidden',
        isolation: 'isolate',
      }}
    >
      <PlatformIconBg
        platform={platform}
        position="top-left"
        widthPct={50}
        iconMarginTop={35}
        iconMarginLeft={35}
      />

      {/* ── URL Input Row ────────────────────────────── */}
      <Box className="df-input-row">
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

      {/* ── Options ──────────────────────────────────── */}
      <Box className="df-options" marginTop={8}>
        {!ios && (
          <OptionRow label={t('autoDownload')} disabled={false}>
            <Switch
              checked={autoDownload}
              onChange={handleAutoDownloadChange}
            />
          </OptionRow>
        )}
        <OptionRow label={t('justAudio')} disabled={false}>
          <Switch checked={justAudio} onChange={setJustAudio} />
        </OptionRow>
        <button
          type="button"
          className="df-advanced-toggle"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-label={t('toggleAdvanced')}
        >
          <Icon
            icon="/icons/chevron-down.svg"
            size={14}
            color="var(--foreground-muted, #999)"
            className={advancedOpen ? 'df-chevron--open' : 'df-chevron--closed'}
          />
        </button>
        <div
          className={`df-advanced-panel${advancedOpen ? ' df-advanced-panel--open' : ''}`}
        >
          <div className="df-advanced-inner">
            <Divider />
            {!smartDownload && (
              <>
                <OptionRow
                  label={t('resolution')}
                  disabled={
                    switchesDisabled ||
                    metadataLoading ||
                    justAudio ||
                    resolutions.length === 0
                  }
                >
                  {metadataLoading ? (
                    <Spinner size={18} thickness={2} label={t('resolution')} />
                  ) : (
                    <ResolutionSelect
                      value={selectedResolution}
                      onChange={setSelectedResolution}
                      disabled={
                        switchesDisabled ||
                        justAudio ||
                        resolutions.length === 0
                      }
                      options={resolutions.map((h) => ({
                        value: h,
                        label: (() => {
                          const name = resolveResolutionLabel(
                            h,
                            widthByHeight[h],
                          );
                          return name ? `${name} ${h}` : `${h}p`;
                        })(),
                      }))}
                    />
                  )}
                </OptionRow>
                <OptionRow
                  label={
                    captionsUnavailable
                      ? t('captionsUnavailable')
                      : t('downloadCaptions')
                  }
                  disabled={captionsDisabled}
                >
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="space-between"
                    gap={20}
                  >
                    <Switch
                      checked={captionsEnabled}
                      onChange={
                        captionsDisabled ? undefined : setCaptionsEnabled
                      }
                    />
                    {captionsEnabled && availableCaptions.length > 0 ? (
                      <CaptionSelect
                        value={selectedCaptionUrl}
                        onChange={setSelectedCaptionUrl}
                        disabled={captionsDisabled}
                        options={availableCaptions}
                      />
                    ) : null}
                  </Box>
                </OptionRow>
              </>
            )}
            <OptionRow label={t('smartDownload')} disabled={justAudio}>
              <Switch
                checked={smartDownload}
                onChange={justAudio ? undefined : handleSmartDownloadChange}
              />
            </OptionRow>
            <div
              className={`df-smart-sub-row-wrap${smartDownload ? ' df-smart-sub-row-wrap--open' : ''}`}
            >
              <div className="df-smart-sub-row-inner">
                <div className="df-smart-sub-row">
                  <Box className="df-smart-sub-row-label">
                    <Typography variant="body-sm" fontWeight={500}>
                      {t('smartCaptions')}
                    </Typography>
                    <Switch
                      checked={smartCaptions}
                      onChange={handleSmartCaptionsChange}
                      disabled={justAudio}
                    />
                  </Box>
                  <Box className="df-smart-sub-row-label">
                    <Typography variant="body-sm" fontWeight={500}>
                      {t('smartMaxHeight')}
                    </Typography>
                    <ResolutionSelect
                      value={smartMaxHeight}
                      onChange={handleSmartMaxHeightChange}
                      disabled={justAudio}
                      options={SMART_RESOLUTION_OPTIONS}
                    />
                  </Box>
                </div>
              </div>
            </div>
            {opfsSupported &&
              storageInfo !== null &&
              storageInfo.usedBytes > 0 &&
              storageInfo.totalBytes > 0 && (
                <>
                  <OptionRow label={t('opfsStorageLabel')} disabled={false}>
                    <Box display="flex" alignItems="center" gap={6}>
                      <Typography
                        variant="body-sm"
                        fontWeight={500}
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
                  </OptionRow>
                  <ProgressBar
                    value={Math.round(
                      (storageInfo.usedBytes / storageInfo.totalBytes) * 100,
                    )}
                    size={4}
                    label={t('opfsStorageLabel')}
                  />
                </>
              )}
          </div>
        </div>
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

      {/* ── Clear Storage Modal ───────────────────── */}
      {showClearStorageConfirm && onRemoveVideosByUuids ? (
        <ClearStorageModal
          onClose={() => void handleStorageModalClose()}
          onRemoveVideosByUuids={onRemoveVideosByUuids}
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
