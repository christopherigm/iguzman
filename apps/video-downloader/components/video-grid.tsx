'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Grid } from '@repo/ui/core-elements/grid';
import type { Platform } from '@repo/helpers/checkers';
import { PinnedVideoItem } from './pinned-video-item';
import { ReadOnlyVideoItem, type ReprocessAction } from './readonly-video-item';
import { VideoToolbar } from './video-toolbar';
import type { StoredVideo, VideoStatus } from './use-video-store';
import { useSearchQuery } from './use-search-store';
import './video-grid.css';

/* ── Constants ──────────────────────────────────────── */

const DEFAULT_PER_PAGE = 8;

/* ── Props ──────────────────────────────────────────── */

export interface VideoGridProps {
  pinned: StoredVideo[];
  completed: StoredVideo[];
  onUpdatePinned: (uuid: string, patch: Partial<StoredVideo>) => void;
  onCompletePinned: (uuid: string) => void;
  onRemovePinned: (uuid: string) => void;
  onUpdateCompleted: (uuid: string, patch: Partial<StoredVideo>) => void;
  onReprocessCompleted: (uuid: string, patch: Partial<StoredVideo>) => void;
  onRemoveCompleted: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function VideoGrid({
  pinned,
  completed,
  onUpdatePinned,
  onCompletePinned,
  onRemovePinned,
  onUpdateCompleted,
  onReprocessCompleted,
  onRemoveCompleted,
}: VideoGridProps) {
  const t = useTranslations('VideoGrid');
  const searchQuery = useSearchQuery();

  /* ── Filter + pagination state ──────────────────── */
  const [activePlatform, setActivePlatform] = useState<Platform | null>(null);
  const [audioOnly, setAudioOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<VideoStatus | 'all'>('all');
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [page, setPage] = useState(1);

  const totalCount = pinned.length + completed.length;

  /* ── Derived: filtered completed list ────────────── */
  const filtered = useMemo(() => {
    let list = completed;

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
  }, [completed, activePlatform, audioOnly, statusFilter, searchQuery]);

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

  /* ── Reprocess handler: move completed → pinned ──── */
  const handleReprocess = useCallback(
    (uuid: string, action: ReprocessAction, extra?: number) => {
      switch (action) {
        case 'fps':
          onReprocessCompleted(uuid, {
            status: 'processing' as VideoStatus,
            fps: String(extra as number),
            fpsApplied: false,
          });
          break;
        case 'h264':
          onReprocessCompleted(uuid, {
            status: 'converting' as VideoStatus,
          });
          break;
        case 'bars':
          onReprocessCompleted(uuid, {
            status: 'processing' as VideoStatus,
            blackBarsRemoved: false,
          });
          break;
        case 'retry':
          onReprocessCompleted(uuid, {
            status: 'pending' as VideoStatus,
            error: null,
            taskId: null,
            file: null,
            downloadURL: null,
          });
          break;
      }
    },
    [onReprocessCompleted],
  );

  /* ── Empty state ────────────────────────────────── */
  if (totalCount === 0) {
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
        <span className="vg-count">{totalCount}</span>
      </div>

      {/* ── Pinned: active-processing items with own FFmpeg instances ── */}
      {pinned.length > 0 ? (
        <div className="vg-pinned">
          <div className="vg-pinned-header">
            <span className="vg-pinned-label">{t('processingTitle')}</span>
            <span className="vg-count">{pinned.length}</span>
          </div>
          <Grid container spacing={2}>
            {pinned.map((video) => (
              <Grid key={video.uuid} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                <PinnedVideoItem
                  video={video}
                  onUpdate={onUpdatePinned}
                  onComplete={onCompletePinned}
                  onRemove={onRemovePinned}
                />
              </Grid>
            ))}
          </Grid>
        </div>
      ) : null}

      <VideoToolbar
        videos={completed}
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
              <ReadOnlyVideoItem
                video={video}
                onReprocess={handleReprocess}
                onRemove={onRemoveCompleted}
                onUpdate={onUpdateCompleted}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </div>
  );
}

export default VideoGrid;
