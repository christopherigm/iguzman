"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { TextInput } from "@repo/ui/core-elements/text-input";
import { Switch } from "@repo/ui/core-elements/switch";
import { Icon } from "@repo/ui/core-elements/icon";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import { ProgressBar } from "@repo/ui/core-elements/progress-bar";
import { detectPlatform, type Platform } from "@repo/helpers/checkers";
import { stripQueryParams } from "@repo/helpers/clean-url";
import {
  isIOS,
  resolveResolutionLabel,
  buildResolutionLabel,
  PlatformIconBg,
} from "./video-item-shared";
import { isOPFSSupported, getOPFSStorageInfo, writeToOPFS } from "@/lib/opfs";
import { ClearStorageModal } from "./clear-storage-modal";
import { useOPFSUrls } from "./opfs-url-context";
import type { StoredVideo } from "./use-video-store";
import type { CaptionOption } from "@/app/api/video-metadata/route";
import { useCreditsBalance, setCreditsBalance } from "./use-credits-store";
import { Divider } from "@repo/ui/core-elements/divider";
import { Grid } from "@repo/ui/core-elements/grid";
import "./platform-icon-bg.css";
import "./download-form.css";

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
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      (parsed.hostname === "www.youtube.com" ||
        parsed.hostname === "youtube.com") &&
      parsed.pathname === "/watch" &&
      parsed.searchParams.has("v")
    ) {
      return url;
    }
  } catch {
    // not a valid URL - fall through to stripQueryParams
  }
  return stripQueryParams(url);
}

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (iOS over HTTP in dev)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Best-effort file extension from a filename, falling back to the MIME type. */
function fileExtension(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()?.toLowerCase()
    : undefined;
  if (fromName) return fromName;
  const fromType = file.type.split("/").pop()?.toLowerCase();
  return fromType && fromType !== "octet-stream" ? fromType : "mp4";
}

/** Load a video blob URL just far enough to read its intrinsic metadata. */
function extractVideoMetadata(
  objectUrl: string,
): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    let settled = false;
    const done = (
      result: {
        duration: number | null;
        width: number | null;
        height: number | null;
      } = { duration: null, width: null, height: null },
    ) => {
      if (settled) return;
      settled = true;
      el.removeAttribute("src");
      el.load();
      resolve(result);
    };
    el.onloadedmetadata = () =>
      done({
        duration:
          Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null,
        width: el.videoWidth || null,
        height: el.videoHeight || null,
      });
    el.onerror = () => done();
    // Guard against a video the browser can't decode metadata for.
    setTimeout(() => done(), 10_000);
    el.src = objectUrl;
  });
}

function isServerPath(url: string | null): url is string {
  if (!url) return false;
  return (
    !url.startsWith("blob:") && (url.startsWith("/") || url.startsWith("http"))
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
    unit = "GB";
  } else if (totalBytes >= 1e6) {
    divisor = 1e6;
    unit = "MB";
  } else if (totalBytes >= 1e3) {
    divisor = 1e3;
    unit = "KB";
  } else {
    divisor = 1;
    unit = "B";
  }

  const usedValue = usedBytes / divisor;
  const totalValue = totalBytes / divisor;

  const usedStr =
    usedValue === 0
      ? "0"
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
      className={`df-option-row${disabled ? " df-option-row--disabled" : ""}`}
    >
      <Typography variant="body" fontWeight={500}>
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
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        aria-label="Resolution"
      >
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ backgroundColor: "var(--surface-1, #f4f4f5)" }}
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
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Subtitles"
      >
        {options.map((opt) => (
          <option
            key={`${opt.type}-${opt.lang}`}
            value={opt.url}
            style={{ backgroundColor: "var(--surface-1, #f4f4f5)" }}
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

const COMMENT_COUNT_OPTIONS: { value: 5 | 10 | 20 | 50; label: string }[] = [
  { value: 5, label: "5" },
  { value: 10, label: "10" },
  { value: 20, label: "20" },
  { value: 50, label: "50" },
];

function CommentCountSelect({
  value,
  onChange,
  disabled,
}: {
  value: 5 | 10 | 20 | 50;
  onChange: (v: 5 | 10 | 20 | 50) => void;
  disabled: boolean;
}) {
  return (
    <Box className="df-select-wrapper">
      <select
        className="df-select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as 5 | 10 | 20 | 50)}
        disabled={disabled}
        aria-label="Max comments"
      >
        {COMMENT_COUNT_OPTIONS.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            style={{ backgroundColor: "var(--surface-1, #f4f4f5)" }}
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
  /** Called when the user submits a URL - creates a pending entry for VideoGrid. */
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
    commentsEnabled?: boolean;
    maxComments?: number;
    /** Whether to fetch ScrapeCreators metadata after download. */
    metadataEnabled?: boolean;
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
  /** Called with a fully-formed completed entry after the user uploads a local video into OPFS. */
  onVideoUploaded?: (entry: StoredVideo) => void;
  /** Called when the user wants to move an existing completed video to the top of the list. */
  onMoveToFirst?: (uuid: string) => void;
  /** Called after a category of OPFS videos is cleared; receives the UUIDs removed. */
  onRemoveVideosByUuids?: (uuids: string[]) => void;
}

export function DownloadForm({
  onVideoAdded,
  onVideoUploaded,
  completedVideos,
  onMoveToFirst,
  onRemoveVideosByUuids,
}: DownloadFormProps = {}) {
  const t = useTranslations("DownloadForm");
  const router = useRouter();
  const { registerUrls } = useOPFSUrls();
  const [url, setUrl] = useState("");
  // Client-only capability/setting values. They must NOT be read from `window`/
  // `localStorage` during render: the server has neither, so a lazy init that
  // read them would make the first client render disagree with the SSR HTML and
  // throw a hydration mismatch. Instead we seed the SSR-safe defaults here and
  // correct them in the mount effect below (see the cinelog movie-catalog note).
  const [ios, setIos] = useState(false);
  const [autoDownload, setAutoDownload] = useState(false);
  const [opfsSupported, setOpfsSupported] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    usedBytes: number;
    totalBytes: number;
  } | null>(null);

  // State declared before the effects/handlers that reference its setters (the
  // React Compiler flags setters used above their declaration).
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
  const [metadataFetched, setMetadataFetched] = useState(false);

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [availableCaptions, setAvailableCaptions] = useState<CaptionOption[]>(
    [],
  );
  const [selectedCaptionUrl, setSelectedCaptionUrl] = useState<string | null>(
    null,
  );
  const [captionsUnavailable, setCaptionsUnavailable] = useState(false);

  const [commentsEnabled, setCommentsEnabled] = useState(false);
  const [commentsUnavailable, setCommentsUnavailable] = useState(false);
  const [commentCount, setCommentCount] = useState<5 | 10 | 20 | 50>(20);

  // Persisted "smart download" settings. Seeded with the same defaults the old
  // server-side branch returned (smartCaptions defaults on) and rehydrated from
  // localStorage in the mount effect below to keep SSR and hydration in step.
  const [smartDownload, setSmartDownload] = useState(false);
  const [smartCaptions, setSmartCaptions] = useState(true);
  const [smartMaxHeight, setSmartMaxHeight] = useState(1080);
  const [smartComments, setSmartComments] = useState(false);
  const [smartMetadata, setSmartMetadata] = useState(false);

  const creditsBalance = useCreditsBalance();
  const [showClearStorageConfirm, setShowClearStorageConfirm] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);

  const [duplicateEntry, setDuplicateEntry] = useState<DuplicateEntry | null>(
    null,
  );

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleAutoDownloadChange = useCallback((value: boolean) => {
    setAutoDownload(value);
    localStorage.setItem("vd_auto_download", String(value));
  }, []);

  const handleSmartDownloadChange = useCallback((value: boolean) => {
    setSmartDownload(value);
    localStorage.setItem("vd_smart_download", String(value));
    if (value) {
      setMetadataFetched(false);
      setResolutions([]);
      setWidthByHeight({});
      setSelectedResolution(null);
      setCaptionsEnabled(false);
      setAvailableCaptions([]);
      setSelectedCaptionUrl(null);
      setCaptionsUnavailable(false);
      setCommentsEnabled(false);
      setCommentsUnavailable(false);
    }
  }, []);

  const handleSmartCaptionsChange = useCallback((value: boolean) => {
    setSmartCaptions(value);
    localStorage.setItem("vd_smart_captions", String(value));
  }, []);

  const handleSmartCommentsChange = useCallback((value: boolean) => {
    setSmartComments(value);
    localStorage.setItem("vd_smart_comments", String(value));
  }, []);

  const handleSmartMetadataChange = useCallback((value: boolean) => {
    setSmartMetadata(value);
    localStorage.setItem("vd_smart_metadata", String(value));
  }, []);

  const handleSmartMaxHeightChange = useCallback((value: number) => {
    setSmartMaxHeight(value);
    localStorage.setItem("vd_smart_max_height", String(value));
  }, []);

  // Rehydrate client-only capability flags and persisted settings after mount.
  // These can't be read during render (see the state declarations above): the
  // SSR HTML is built with the defaults, so the first client render must match
  // them, then this effect corrects to the real browser values on the client.
  useEffect(() => {
    const onIOS = isIOS();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only capability reads (see note above)
    setIos(onIOS);
    setOpfsSupported(isOPFSSupported());
    if (!onIOS) {
      setAutoDownload(localStorage.getItem("vd_auto_download") === "true");
    }
    setSmartDownload(localStorage.getItem("vd_smart_download") === "true");
    setSmartCaptions(localStorage.getItem("vd_smart_captions") !== "false");
    const maxHeight = localStorage.getItem("vd_smart_max_height");
    if (maxHeight) setSmartMaxHeight(Number(maxHeight));
    setSmartComments(localStorage.getItem("vd_smart_comments") === "true");
    setSmartMetadata(localStorage.getItem("vd_smart_metadata") === "true");
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

  /* Paste from clipboard when the URL input is focused */
  const handleInputFocus = useCallback(async () => {
    if (url) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (isValidUrl(text)) {
        setUrl(cleanUrl(text));
      }
    } catch {
      // Clipboard permission denied - silently ignore
    }
  }, [url]);

  /* Clear metadata whenever the URL changes. Done during render (a sanctioned
     setState-on-changed-value) rather than in an effect. */
  const [metadataUrl, setMetadataUrl] = useState(url);
  if (url !== metadataUrl) {
    setMetadataUrl(url);
    setMetadataFetched(false);
    setResolutions([]);
    setWidthByHeight({});
    setSelectedResolution(null);
    setCaptionsEnabled(false);
    setAvailableCaptions([]);
    setSelectedCaptionUrl(null);
    setCaptionsUnavailable(false);
    setCommentsEnabled(false);
    setCommentsUnavailable(false);
  }

  /* Derived state */
  const validUrl = useMemo(() => isValidUrl(url), [url]);
  const platform = useMemo<Platform>(
    () => (validUrl ? detectPlatform(url) : "unknown"),
    [url, validUrl],
  );
  const knownPlatform = platform !== "unknown";
  const validPlatformUrl = validUrl && knownPlatform;

  /* Disabled flags */
  const switchesDisabled = !validPlatformUrl;
  const captionsDisabled = switchesDisabled || justAudio || captionsUnavailable;
  const noCreditsForPlatform = platform !== "youtube" && creditsBalance <= 0;
  const commentsDisabled =
    switchesDisabled ||
    justAudio ||
    commentsUnavailable ||
    noCreditsForPlatform;

  /* Credit cost */
  const effectiveCommentsEnabled = smartDownload
    ? smartComments
    : commentsEnabled;
  const isScrapePlatform =
    platform === "facebook" ||
    platform === "instagram" ||
    platform === "tiktok";
  const effectiveMetadataEnabled = smartDownload ? smartMetadata : false;
  const creditCost =
    1 +
    (platform !== "youtube" && !justAudio && effectiveCommentsEnabled ? 1 : 0) +
    (isScrapePlatform && !justAudio && effectiveMetadataEnabled ? 1 : 0);
  /* Effective values (justAudio overrides enhance) */
  const effectiveEnhance = justAudio ? false : enhance;

  /* Show credits modal when the URL first becomes valid and the user has no
     credits/key. Tracked during render via a state token instead of an effect. */
  const [creditsCheckedValid, setCreditsCheckedValid] = useState(false);
  if (validPlatformUrl !== creditsCheckedValid) {
    setCreditsCheckedValid(validPlatformUrl);
    if (validPlatformUrl) {
      const key = localStorage.getItem("vd_credits_key");
      if (creditsBalance <= 0 || !key) {
        setShowCreditsModal(true);
      }
    }
  }

  /* Handlers */
  const handleCheckSpecs = useCallback(async () => {
    if (!validPlatformUrl) return;
    setMetadataLoading(true);
    setMetadataFetched(false);
    try {
      const creditsKey = localStorage.getItem("vd_credits_key");
      const res = await fetch("/api/video-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(creditsKey && { "x-credits-key": creditsKey }),
        },
        body: JSON.stringify({ url, exhaustive: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        heights?: number[];
        widthByHeight?: Record<number, number>;
        captions?: CaptionOption[];
        commentCount?: number | null;
        creditsRemaining?: number;
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

      const count = data.commentCount ?? null;
      const isScrapePlatform =
        platform === "facebook" ||
        platform === "instagram" ||
        platform === "tiktok";
      const commentsAvailable = isScrapePlatform || count != null;
      setCommentsUnavailable(!commentsAvailable);

      if (data.creditsRemaining !== undefined)
        setCreditsBalance(data.creditsRemaining);
      const effectiveBalance =
        data.creditsRemaining !== undefined
          ? data.creditsRemaining
          : creditsBalance;
      if (platform !== "youtube" && effectiveBalance <= 0) {
        setCommentsEnabled(false);
      } else if (platform === "youtube" && commentsAvailable) {
        setCommentsEnabled(true);
      }

      setMetadataFetched(true);
    } catch {
      // leave controls hidden on error
    } finally {
      setMetadataLoading(false);
    }
  }, [validPlatformUrl, url, platform, creditsBalance]);

  const handleClear = useCallback(() => {
    setUrl("");
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
    const effectiveCommentsEnabled =
      !justAudio && (smartDownload ? smartComments : commentsEnabled);
    const effectiveMaxComments = smartDownload ? 30 : commentCount;
    const effectiveMetadataEnabled =
      !justAudio && smartDownload && smartMetadata && platform !== "youtube";

    onVideoAdded?.({
      originalURL: url,
      platform,
      fps: "original",
      justAudio,
      enhance: effectiveEnhance,
      autoDownload,
      ...(effectiveMaxHeight != null && { maxHeight: effectiveMaxHeight }),
      captionsEnabled: effectiveCaptionsEnabled,
      ...(effectiveCaptionUrl != null && { captionUrl: effectiveCaptionUrl }),
      commentsEnabled: effectiveCommentsEnabled,
      ...(effectiveCommentsEnabled && { maxComments: effectiveMaxComments }),
      metadataEnabled: effectiveMetadataEnabled,
      opfsEnabled: opfsSupported,
    });

    /* Reset the URL field and captions/comments toggles after submission */
    setUrl("");
    setCaptionsEnabled(false);
    setCommentsEnabled(false);
  }, [
    url,
    justAudio,
    autoDownload,
    effectiveEnhance,
    platform,
    selectedResolution,
    captionsEnabled,
    selectedCaptionUrl,
    commentsEnabled,
    commentCount,
    smartComments,
    smartMetadata,
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
        downloadURL: dupe.downloadURL ?? "",
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
    const a = document.createElement("a");
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

  /* ── Upload a local video into OPFS ──────────────── */
  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      /* Reset the input so selecting the same file again re-fires onChange. */
      e.target.value = "";
      if (!file || !opfsSupported) return;

      setUploading(true);
      const objectUrl = URL.createObjectURL(file);
      try {
        const meta = await extractVideoMetadata(objectUrl);

        const uuid = generateUUID();
        const ext = fileExtension(file);
        const key = `${uuid}.${ext}`;

        await writeToOPFS(key, file);

        /* Register the blob URL for this session so the card can render/play
           the file without a server round-trip. */
        registerUrls(uuid, { videoUrl: objectUrl, thumbnailUrl: null });

        const displayName = file.name.includes(".")
          ? file.name.slice(0, file.name.lastIndexOf("."))
          : file.name;

        const entry: StoredVideo = {
          uuid,
          status: "done",
          error: null,
          fps: "original",
          justAudio: false,
          enhance: false,
          autoDownload: false,
          downloadURL: `opfs://${key}`,
          originalURL: "",
          platform: "unknown",
          file: key,
          name: displayName,
          fulltitle: file.name,
          thumbnail: null,
          duration: meta.duration,
          uploader: null,
          uploader_id: null,
          uploader_url: null,
          uploadTimestamp: file.lastModified
            ? Math.floor(file.lastModified / 1000)
            : null,
          description: null,
          tags: null,
          createdAt: Date.now(),
          fpsApplied: true,
          isH265: false,
          h264Converted: false,
          h265Converted: false,
          blackBarsRemoved: false,
          taskId: null,
          sourceFps: null,
          width: meta.width,
          height: meta.height,
          maxHeight: null,
          captionsEnabled: false,
          captionUrl: null,
          captionsFile: null,
          commentsEnabled: false,
          maxComments: null,
          metadataEnabled: false,
          commentsFile: null,
          scrapeCreditsRemaining: null,
          opfsCommentsKey: null,
          burnCaptionsConfig: null,
          captionsBurned: false,
          useServerProcessing: false,
          serverTaskId: null,
          opfsEnabled: true,
          opfsKey: key,
          opfsThumbnailKey: null,
          opfsCaptionsKey: null,
          opfsStored: true,
          serverFileDeleted: true,
          fileSize: file.size,
          scaleDownTargetHeight: null,
          diarizeMaxWords: null,
          operationCredits: null,
        };

        onVideoUploaded?.(entry);

        /* Refresh the storage-usage bar now that a new file was written. */
        const info = await getOPFSStorageInfo();
        setStorageInfo(info);
      } catch {
        /* Metadata read or OPFS write failed - drop the temporary blob URL. */
        URL.revokeObjectURL(objectUrl);
      } finally {
        setUploading(false);
      }
    },
    [opfsSupported, registerUrls, onVideoUploaded],
  );

  const handleStorageModalClose = useCallback(async () => {
    setShowClearStorageConfirm(false);
    /* Refresh the storage bar after any category clears */
    const info = await getOPFSStorageInfo();
    setStorageInfo(info);
  }, []);

  const formContent = (
    <Box
      elevation={4}
      borderRadius={8}
      padding={7}
      flexDirection="column"
      width="100%"
      backgroundColor="var(--surface-1, #fff)"
      styles={{
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
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
            onChange={(v: string) => setUrl(cleanUrl(v))}
            onFocus={handleInputFocus}
            label={t("inputLabel")}
          />
        </Box>

        <Box display="flex" marginTop={12} gap={8}>
          {url && (
            <IconButton
              icon="/icons/delete.svg"
              aria-label={t("clearUrl")}
              onClick={handleClear}
              iconColor="var(--foreground, #171717)"
            />
          )}
          <Button
            type="submit"
            kind="primary"
            icon="/icons/download.svg"
            aria-label={t("download")}
            disabled={!validPlatformUrl || creditsBalance < creditCost}
            width={36}
            height={36}
            borderRadius={8}
            styles={{ padding: 0, justifyContent: "center" }}
          />
        </Box>
      </Box>
      {validPlatformUrl && !justAudio && (
        <Typography
          variant="caption"
          className="df-smart-hint"
          color="var(--accent, #06b6d4)"
        >
          {`🪙 ${creditCost}`}
          {smartDownload &&
            ` ${t("smartDownloadHintOn", {
              resolution:
                resolveResolutionLabel(smartMaxHeight) ?? `${smartMaxHeight}p`,
            })}`}
          {smartDownload &&
            smartCaptions &&
            ` ${t("smartDownloadHintCaptions")}`}
          {smartDownload &&
            smartComments &&
            ` ${t("smartDownloadHintComments")}`}
          {smartDownload &&
            smartMetadata &&
            isScrapePlatform &&
            ` ${t("smartDownloadHintMetadata")}`}
        </Typography>
      )}

      {/* ── Options ──────────────────────────────────── */}
      <Box className="df-options" marginTop={8}>
        {!ios && (
          <OptionRow label={t("autoDownload")} disabled={false}>
            <Switch
              checked={autoDownload}
              onChange={handleAutoDownloadChange}
            />
          </OptionRow>
        )}
        <OptionRow label={t("justAudio")} disabled={false}>
          <Switch checked={justAudio} onChange={setJustAudio} />
        </OptionRow>
        <button
          type="button"
          className="df-advanced-toggle"
          onClick={() => setAdvancedOpen((prev) => !prev)}
          aria-label={t("toggleAdvanced")}
        >
          <Icon
            icon="/icons/chevron-down.svg"
            size={14}
            color="var(--foreground-muted, #999)"
            className={advancedOpen ? "df-chevron--open" : "df-chevron--closed"}
          />
        </button>
        <Box
          className={`df-advanced-panel${advancedOpen ? " df-advanced-panel--open" : ""}`}
        >
          <Box className="df-advanced-inner">
            {opfsSupported && (
              <Box
                flexDirection="column"
                gap={8}
                marginTop={8}
                marginBottom={8}
              >
                <Box display="flex" justifyContent="center">
                  <Button
                    text={uploading ? t("uploadingVideo") : t("uploadVideo")}
                    icon="/icons/up-arrow.svg"
                    onClick={handleUploadClick}
                    disabled={uploading}
                    size="md"
                    kind="primary"
                  />
                </Box>
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="video/*"
                  aria-hidden="true"
                  style={{ display: "none" }}
                  onChange={(e) => void handleFileSelected(e)}
                />
                {uploading && (
                  <ProgressBar label={t("uploadingVideo")} width="100%" />
                )}
              </Box>
            )}
            <Divider />
            {!smartDownload && (
              <>
                <Button
                  text={
                    metadataLoading
                      ? t("checkingSpecs")
                      : `${t("checkSpecs")} 🪙 1`
                  }
                  onClick={() => void handleCheckSpecs()}
                  disabled={
                    !validPlatformUrl ||
                    metadataLoading ||
                    justAudio ||
                    creditsBalance < 1
                  }
                  width="100%"
                  size="md"
                  kind="primary"
                  marginTop={8}
                  marginBottom={8}
                />
                {metadataFetched && (
                  <>
                    <OptionRow
                      label={t("resolution")}
                      disabled={
                        switchesDisabled ||
                        justAudio ||
                        resolutions.length === 0
                      }
                    >
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
                    </OptionRow>
                    <OptionRow
                      label={
                        captionsUnavailable
                          ? t("captionsUnavailable")
                          : t("downloadCaptions")
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
                    <OptionRow
                      label={
                        commentsUnavailable
                          ? t("commentsUnavailable")
                          : t("downloadComments")
                      }
                      disabled={commentsDisabled}
                    >
                      <Box
                        display="flex"
                        alignItems="center"
                        justifyContent="space-between"
                        gap={20}
                      >
                        <Switch
                          checked={commentsEnabled}
                          onChange={
                            commentsDisabled ? undefined : setCommentsEnabled
                          }
                        />
                        {commentsEnabled ? (
                          <CommentCountSelect
                            value={commentCount}
                            onChange={setCommentCount}
                            disabled={false}
                          />
                        ) : null}
                      </Box>
                    </OptionRow>
                    {noCreditsForPlatform && !commentsUnavailable && (
                      <OptionRow
                        label={t("commentsNoCredits")}
                        disabled={justAudio}
                      >
                        <Button
                          text={t("commentsBuyCredits")}
                          href="/credits"
                          size="sm"
                          kind="primary"
                        />
                      </OptionRow>
                    )}
                  </>
                )}
              </>
            )}
            <Divider />
            <OptionRow label={t("smartDownload")} disabled={justAudio}>
              <Switch
                checked={smartDownload}
                onChange={justAudio ? undefined : handleSmartDownloadChange}
              />
            </OptionRow>
            <Box
              className={`df-smart-sub-row-wrap${smartDownload ? " df-smart-sub-row-wrap--open" : ""}`}
            >
              <Box className="df-smart-sub-row-inner">
                <Grid container spacing={1} marginTop={5} marginBottom={5}>
                  <Grid size={{ xs: 6 }} padding={5}>
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      gap={8}
                    >
                      <Typography variant="body" fontWeight={500}>
                        {t("smartCaptions")}
                      </Typography>
                      <Switch
                        checked={smartCaptions}
                        onChange={handleSmartCaptionsChange}
                        disabled={justAudio}
                      />
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 6 }} padding={5}>
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      gap={8}
                    >
                      <Typography variant="body" fontWeight={500}>
                        {t("comments")}
                        {platform !== "youtube" &&
                          platform !== "unknown" &&
                          " 🪙 1"}
                      </Typography>
                      <Switch
                        checked={smartComments}
                        onChange={
                          justAudio ? undefined : handleSmartCommentsChange
                        }
                        disabled={justAudio}
                      />
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 6 }} padding={5}>
                    <Box display="flex" justifyContent="center">
                      <ResolutionSelect
                        value={smartMaxHeight}
                        onChange={handleSmartMaxHeightChange}
                        disabled={justAudio}
                        options={SMART_RESOLUTION_OPTIONS}
                      />
                    </Box>
                  </Grid>
                  <Grid size={{ xs: 6 }} padding={5}>
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      gap={8}
                    >
                      <Typography variant="body" fontWeight={500}>
                        {t("smartMetadata")}
                        {isScrapePlatform && " 🪙 1"}
                      </Typography>
                      <Switch
                        checked={smartMetadata}
                        onChange={
                          justAudio || platform === "youtube"
                            ? undefined
                            : handleSmartMetadataChange
                        }
                        disabled={justAudio || platform === "youtube"}
                      />
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Box>
            {opfsSupported &&
              storageInfo !== null &&
              storageInfo.usedBytes > 0 &&
              storageInfo.totalBytes > 0 && (
                <>
                  <OptionRow label={t("opfsStorageLabel")} disabled={false}>
                    <Box display="flex" alignItems="center" gap={6}>
                      <Typography
                        variant="body"
                        fontWeight={500}
                        marginRight={8}
                      >
                        {(() => {
                          const { used, total, pct } = formatStorageUsage(
                            storageInfo.usedBytes,
                            storageInfo.totalBytes,
                          );
                          return t("opfsStorageUsage", { used, total, pct });
                        })()}
                      </Typography>
                      <Button
                        kind="primary"
                        icon="/icons/clear.svg"
                        aria-label={t("clearStorageLabel")}
                        onClick={() => setShowClearStorageConfirm(true)}
                        width={36}
                        height={36}
                        borderRadius={8}
                        styles={{ padding: 0, justifyContent: "center" }}
                      />
                    </Box>
                  </OptionRow>
                  <ProgressBar
                    value={Math.round(
                      (storageInfo.usedBytes / storageInfo.totalBytes) * 100,
                    )}
                    size={4}
                    label={t("opfsStorageLabel")}
                  />
                </>
              )}
          </Box>
        </Box>
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

      {/* ── No Credits Modal ─────────────────────── */}
      {showCreditsModal && (
        <ConfirmationModal
          title={t("creditsRequiredTitle")}
          text={t("creditsRequiredText")}
          okCallback={() => router.push("/credits")}
          cancelCallback={() => setShowCreditsModal(false)}
          panelMaxWidth="440px"
        />
      )}

      {/* ── Duplicate Video Modal ─────────────────── */}
      {duplicateEntry ? (
        <ConfirmationModal
          title={t("duplicateTitle")}
          text={t("duplicateText")}
          okCallback={handleDuplicateClose}
          cancelCallback={handleDuplicateClose}
          panelMaxWidth="440px"
        >
          <Box display="flex" flexDirection="column" gap={8}>
            {isServerPath(duplicateEntry.downloadURL) && (
              <Button
                text={t("duplicateDownloadVideo")}
                onClick={handleDuplicateDownload}
                width="100%"
                size="md"
              />
            )}
            <Button
              text={t("duplicateMoveToFirst")}
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
