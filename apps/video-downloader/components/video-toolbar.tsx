"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Platform } from "@repo/helpers/checkers";
import type { VideoStatus, StoredVideo } from "./use-video-store";
import "./video-toolbar.css";
import Box from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";

/* ── Platform icon map (mirrors video-item.tsx) ──────── */

const PLATFORM_ICONS: Record<string, string> = {
  facebook: "/icons/facebook.svg",
  instagram: "/icons/instagram.svg",
  pinterest: "/icons/pinterest.svg",
  rednote: "/icons/url.svg",
  tidal: "/icons/url.svg",
  tiktok: "/icons/tiktok.svg",
  x: "/icons/x.svg",
  youtube: "/icons/youtube.svg",
};

/**
 * Shared IconButton props for the square 32px filter toggles. Active state is
 * driven by props (accent fill + accent-foreground icon + glow) rather than CSS,
 * since IconButton applies its box/background styles inline.
 */
function vtFilterStyle(active: boolean) {
  return {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: active ? "var(--accent, #06b6d4)" : undefined,
    border: active
      ? "2px solid var(--accent, #06b6d4)"
      : "2px solid transparent",
    iconColor: active
      ? "var(--accent-foreground, #fff)"
      : "var(--foreground-muted, #888)",
    styles: active
      ? {
          boxShadow:
            "0 2px 8px color-mix(in srgb, var(--accent, #06b6d4) 30%, transparent)",
        }
      : undefined,
  };
}

const PER_PAGE_OPTIONS = [8, 12, 16, 24, 32] as const;

const STATUS_OPTIONS: (VideoStatus | "all")[] = [
  "all",
  "pending",
  "downloading",
  "queued",
  "processing",
  "converting",
  "done",
  "error",
];

/* ── Props ──────────────────────────────────────────── */

export interface VideoToolbarProps {
  videos: StoredVideo[];
  /** Currently selected platform filter (null = all). */
  activePlatform: Platform | null;
  onPlatformChange: (platform: Platform | null) => void;
  /** Audio-only filter active. */
  audioOnly: boolean;
  onAudioOnlyChange: (active: boolean) => void;
  /** Status filter. */
  statusFilter: VideoStatus | "all";
  onStatusFilterChange: (status: VideoStatus | "all") => void;
  /** Items per page. */
  perPage: number;
  onPerPageChange: (n: number) => void;
  /** Pagination. */
  page: number;
  totalPages: number;
  filteredCount: number;
  onPageChange: (p: number) => void;
}

/* ── Component ──────────────────────────────────────── */

export function VideoToolbar({
  videos,
  activePlatform,
  onPlatformChange,
  audioOnly,
  onAudioOnlyChange,
  statusFilter,
  onStatusFilterChange,
  perPage,
  onPerPageChange,
  page,
  totalPages,
  filteredCount,
  onPageChange,
}: VideoToolbarProps) {
  const t = useTranslations("VideoGrid");

  /* Derive unique platforms present in the video list. */
  const platforms = useMemo(() => {
    const set = new Set<Platform>();
    for (const v of videos) {
      if (v.platform !== "unknown") set.add(v.platform);
    }
    /* Deterministic order matching the union type declaration */
    const order: Platform[] = [
      "facebook",
      "instagram",
      "pinterest",
      "rednote",
      "tidal",
      "tiktok",
      "x",
      "youtube",
    ];
    return order.filter((p) => set.has(p));
  }, [videos]);

  /* Check if any video has justAudio */
  const hasAudioVideos = useMemo(
    () => videos.some((v) => v.justAudio),
    [videos],
  );

  return (
    <Box className="vt-bar">
      {/* ── Platform + audio filter icons ─────────────── */}
      <Box className="vt-filters">
        {/* "All" button */}
        <IconButton
          icon="/icons/filter.svg"
          iconSize={18}
          aria-label={t("filterAll")}
          title={t("filterAll")}
          aria-pressed={activePlatform === null && !audioOnly}
          onClick={() => {
            onPlatformChange(null);
            onAudioOnlyChange(false);
          }}
          {...vtFilterStyle(activePlatform === null && !audioOnly)}
        />

        {platforms.map((platform) => {
          const iconSrc = PLATFORM_ICONS[platform]!;
          const active = activePlatform === platform && !audioOnly;
          return (
            <IconButton
              key={platform}
              icon={iconSrc}
              iconSize={18}
              aria-label={`${t("filterPlatform")}: ${platform}`}
              title={platform}
              aria-pressed={active}
              onClick={() => {
                onAudioOnlyChange(false);
                onPlatformChange(activePlatform === platform ? null : platform);
              }}
              {...vtFilterStyle(active)}
            />
          );
        })}

        {/* Audio-only filter */}
        {hasAudioVideos && (
          <>
            <span className="vt-divider" />
            <IconButton
              icon="/icons/music.svg"
              iconSize={18}
              aria-label={t("filterAudioOnly")}
              title={t("filterAudioOnly")}
              aria-pressed={audioOnly}
              onClick={() => {
                if (!audioOnly) onPlatformChange(null);
                onAudioOnlyChange(!audioOnly);
              }}
              {...vtFilterStyle(audioOnly)}
            />
          </>
        )}
      </Box>
      {/* ── Status filter dropdown ────────────────────── */}
      <Box className="vt-select-wrap">
        <select
          className="vt-select"
          value={statusFilter}
          onChange={(e) =>
            onStatusFilterChange(e.target.value as VideoStatus | "all")
          }
          aria-label={t("filterStatus")}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? t("filterStatusAll") : t(`status_${s}`)}
            </option>
          ))}
        </select>
        <span className="vt-select-chevron" aria-hidden />
      </Box>
      {/* ── Per-page dropdown ─────────────────────────── */}
      {filteredCount > perPage && (
        <Box className="vt-select-wrap">
          <select
            className="vt-select"
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            aria-label={t("perPage")}
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} / {t("perPageLabel")}
              </option>
            ))}
          </select>
          <span className="vt-select-chevron" aria-hidden />
        </Box>
      )}
      {/* ── Spacer ────────────────────────────────────── */}
      <Box className="vt-spacer" />
      {/* ── Pagination ────────────────────────────────── */}
      {totalPages > 1 && (
        <Box className="vt-pagination">
          <Box className="vt-pagination-inner">
            <Button
              icon="/icons/chevron-left.svg"
              iconSize="14px"
              iconColor="var(--foreground-muted, #888)"
              aria-label={t("prevPage")}
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              width={30}
              height={30}
              borderRadius={8}
              border="1.5px solid color-mix(in srgb, var(--foreground, #111) 8%, transparent)"
              backgroundColor="color-mix(in srgb, var(--foreground, #111) 3%, transparent)"
              styles={{ padding: 0, justifyContent: "center" }}
            />

            <Typography variant="body" className="vt-page-info">
              {page} / {totalPages}
              <Typography
                as="span"
                variant="none"
                marginLeft={4}
                styles={{ opacity: 0.7 }}
              >
                ({filteredCount})
              </Typography>
            </Typography>

            <Button
              icon="/icons/chevron-right.svg"
              iconSize="14px"
              iconColor="var(--foreground-muted, #888)"
              aria-label={t("nextPage")}
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              width={30}
              height={30}
              borderRadius={8}
              border="1.5px solid color-mix(in srgb, var(--foreground, #111) 8%, transparent)"
              backgroundColor="color-mix(in srgb, var(--foreground, #111) 3%, transparent)"
              styles={{ padding: 0, justifyContent: "center" }}
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
