'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Grid } from '@repo/ui/core-elements/grid';
import type { Platform } from '@repo/helpers/checkers';
import { VideoItem } from './video-item';
import { VideoToolbar } from './video-toolbar';
import type { StoredVideo, VideoStatus } from './use-video-store';
import { useSearchQuery } from './use-search-store';
import './video-grid.css';

/* ── Constants ──────────────────────────────────────── */

const DEFAULT_PER_PAGE = 8;

/** Statuses that represent active client- or server-side work.
 *  VideoItems in these states are pinned to a separate grid so that
 *  pagination or filter changes cannot unmount them mid-processing. */
const BUSY_STATUSES = new Set<VideoStatus>([
  'downloading',
  'queued',
  'processing',
  'converting',
]);

/* ── Props ──────────────────────────────────────────── */

export interface VideoGridProps {
  videos: StoredVideo[];
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function VideoGrid({ videos, onUpdate, onRemove }: VideoGridProps) {
  const t = useTranslations('VideoGrid');
  const searchQuery = useSearchQuery();

  /* ── Filter + pagination state ──────────────────── */
  const [activePlatform, setActivePlatform] = useState<Platform | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<VideoStatus | 'all'>('all');
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [page, setPage] = useState(1);

  /* ── Derived: pinned (active processing) ────────── */
  const pinned = useMemo(
    () => videos.filter((v) => BUSY_STATUSES.has(v.status)),
    [videos],
  );
  const pinnedSet = useMemo(
    () => new Set(pinned.map((v) => v.uuid)),
    [pinned],
  );

  /* ── Derived: filtered list ─────────────────────── */
  const filtered = useMemo(() => {
    /* Exclude pinned items — they are always rendered in the pinned grid. */
    let list = videos.filter((v) => !pinnedSet.has(v.uuid));

    /* Text search by name / uploader / URL */
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.name?.toLowerCase().includes(q) ||
          v.uploader?.toLowerCase().includes(q) ||
          v.originalURL?.toLowerCase().includes(q),
      );
    }

    if (audioOnly) {
      list = list.filter((v) => v.justAudio);
    } else if (activePlatform) {
      list = list.filter((v) => v.platform === activePlatform);
    }

    if (statusFilter !== 'all') {
      list = list.filter((v) => v.status === statusFilter);
    }

    return list;
  }, [videos, pinnedSet, activePlatform, audioOnly, statusFilter, searchQuery]);

  /* ── Derived: pagination ────────────────────────── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * perPage;
  const pageVideos = filtered.slice(pageStart, pageStart + perPage);

  /* Reset to page 1 whenever filters or perPage change */
  const handlePlatformChange = useCallback((p: Platform | null) => {
    setActivePlatform(p);
    setPage(1);
  }, []);

  const handleAudioOnlyChange = useCallback((active: boolean) => {
    setAudioOnly(active);
    setPage(1);
  }, []);

  const handleStatusFilterChange = useCallback((s: VideoStatus | 'all') => {
    setStatusFilter(s);
    setPage(1);
  }, []);

  const handlePerPageChange = useCallback((n: number) => {
    setPerPage(n);
    setPage(1);
  }, []);

  /* ── Empty state ────────────────────────────────── */
  if (videos.length === 0) {
    return (
      <div className="vg-empty">
        <span className="vg-empty-text">{t('emptyState')}</span>
      </div>
    );
  }

  return (
    <div className="vg-wrapper">
      <div className="vg-header">
        <span className="vg-title">{t('title')}</span>
        <span className="vg-count">{videos.length}</span>
      </div>

      {/* ── Pinned: active-processing items are always mounted ── */}
      {pinned.length > 0 ? (
        <div className="vg-pinned">
          <div className="vg-pinned-header">
            <span className="vg-pinned-label">{t('processingTitle')}</span>
            <span className="vg-count">{pinned.length}</span>
          </div>
          <Grid container spacing={2}>
            {pinned.map((video) => (
              <Grid key={video.uuid} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <VideoItem
                  video={video}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              </Grid>
            ))}
          </Grid>
        </div>
      ) : null}

      <VideoToolbar
        videos={videos}
        activePlatform={activePlatform}
        onPlatformChange={handlePlatformChange}
        audioOnly={audioOnly}
        onAudioOnlyChange={handleAudioOnlyChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        perPage={perPage}
        onPerPageChange={handlePerPageChange}
        page={safePage}
        totalPages={totalPages}
        filteredCount={filtered.length}
        onPageChange={setPage}
      />

      {pageVideos.length === 0 ? (
        <div className="vg-empty vg-empty--filtered">
          <span className="vg-empty-text">{t('noResults')}</span>
        </div>
      ) : (
        <Grid container spacing={2}>
          {pageVideos.map((video) => (
            <Grid key={video.uuid} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
              <VideoItem
                video={video}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </div>
  );
}

export default VideoGrid;
