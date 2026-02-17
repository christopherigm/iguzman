'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { Platform } from '@repo/helpers/checkers';
import type { VideoStatus, StoredVideo } from './use-video-store';
import './video-toolbar.css';

/* ── Platform icon map (mirrors video-item.tsx) ──────── */

const PLATFORM_ICONS: Record<string, string> = {
  facebook: '/icons/facebook.svg',
  instagram: '/icons/instagram.svg',
  pinterest: '/icons/pinterest.svg',
  rednote: '/icons/url.svg',
  tidal: '/icons/url.svg',
  tiktok: '/icons/tiktok.svg',
  x: '/icons/x.svg',
  youtube: '/icons/youtube.svg',
};

const PER_PAGE_OPTIONS = [8, 12, 16, 24, 32] as const;

const STATUS_OPTIONS: (VideoStatus | 'all')[] = [
  'all',
  'pending',
  'downloading',
  'processing',
  'done',
  'error',
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
  statusFilter: VideoStatus | 'all';
  onStatusFilterChange: (status: VideoStatus | 'all') => void;
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
  const t = useTranslations('VideoGrid');

  /* Derive unique platforms present in the video list. */
  const platforms = useMemo(() => {
    const set = new Set<Platform>();
    for (const v of videos) {
      if (v.platform !== 'unknown') set.add(v.platform);
    }
    /* Deterministic order matching the union type declaration */
    const order: Platform[] = [
      'facebook',
      'instagram',
      'pinterest',
      'rednote',
      'tidal',
      'tiktok',
      'x',
      'youtube',
    ];
    return order.filter((p) => set.has(p));
  }, [videos]);

  /* Check if any video has justAudio */
  const hasAudioVideos = useMemo(
    () => videos.some((v) => v.justAudio),
    [videos],
  );

  return (
    <div className="vt-bar">
      {/* ── Platform + audio filter icons ─────────────── */}
      <div className="vt-filters">
        {/* "All" button */}
        <button
          type="button"
          className="vt-icon-btn"
          data-active={activePlatform === null && !audioOnly}
          onClick={() => {
            onPlatformChange(null);
            onAudioOnlyChange(false);
          }}
          title={t('filterAll')}
          aria-label={t('filterAll')}
        >
          <span
            className="vt-icon"
            style={{
              maskImage: 'url(/icons/filter.svg)',
              WebkitMaskImage: 'url(/icons/filter.svg)',
            }}
          />
        </button>

        {platforms.map((platform) => {
          const iconSrc = PLATFORM_ICONS[platform]!;
          return (
            <button
              key={platform}
              type="button"
              className="vt-icon-btn"
              data-active={activePlatform === platform && !audioOnly}
              onClick={() => {
                onAudioOnlyChange(false);
                onPlatformChange(activePlatform === platform ? null : platform);
              }}
              title={platform}
              aria-label={`${t('filterPlatform')}: ${platform}`}
            >
              <span
                className="vt-icon"
                style={{
                  maskImage: `url(${iconSrc})`,
                  WebkitMaskImage: `url(${iconSrc})`,
                }}
              />
            </button>
          );
        })}

        {/* Audio-only filter */}
        {hasAudioVideos && (
          <>
            <span className="vt-divider" />
            <button
              type="button"
              className="vt-icon-btn"
              data-active={audioOnly}
              onClick={() => {
                if (!audioOnly) onPlatformChange(null);
                onAudioOnlyChange(!audioOnly);
              }}
              title={t('filterAudioOnly')}
              aria-label={t('filterAudioOnly')}
            >
              <span
                className="vt-icon"
                style={{
                  maskImage: 'url(/icons/music.svg)',
                  WebkitMaskImage: 'url(/icons/music.svg)',
                }}
              />
            </button>
          </>
        )}
      </div>

      {/* ── Status filter dropdown ────────────────────── */}
      <div className="vt-select-wrap">
        <select
          className="vt-select"
          value={statusFilter}
          onChange={(e) =>
            onStatusFilterChange(e.target.value as VideoStatus | 'all')
          }
          aria-label={t('filterStatus')}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? t('filterStatusAll') : t(`status_${s}`)}
            </option>
          ))}
        </select>
        <span className="vt-select-chevron" aria-hidden />
      </div>

      {/* ── Per-page dropdown ─────────────────────────── */}
      <div className="vt-select-wrap">
        <select
          className="vt-select"
          value={perPage}
          onChange={(e) => onPerPageChange(Number(e.target.value))}
          aria-label={t('perPage')}
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} / {t('perPageLabel')}
            </option>
          ))}
        </select>
        <span className="vt-select-chevron" aria-hidden />
      </div>

      {/* ── Spacer ────────────────────────────────────── */}
      <span className="vt-spacer" />

      {/* ── Pagination ────────────────────────────────── */}
      <div className="vt-pagination">
        <button
          type="button"
          className="vt-page-btn vt-page-btn--prev"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('prevPage')}
        >
          <span
            className="vt-icon"
            style={{
              maskImage: 'url(/icons/chevron-down.svg)',
              WebkitMaskImage: 'url(/icons/chevron-down.svg)',
            }}
          />
        </button>

        <span className="vt-page-info">
          {page} / {totalPages}
          <span style={{ opacity: 0.5, marginLeft: 4 }}>({filteredCount})</span>
        </span>

        <button
          type="button"
          className="vt-page-btn vt-page-btn--next"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('nextPage')}
        >
          <span
            className="vt-icon"
            style={{
              maskImage: 'url(/icons/chevron-down.svg)',
              WebkitMaskImage: 'url(/icons/chevron-down.svg)',
            }}
          />
        </button>
      </div>
    </div>
  );
}
