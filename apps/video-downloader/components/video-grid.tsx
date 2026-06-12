'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Grid } from '@repo/ui/core-elements/grid';
import { Typography } from '@repo/ui/core-elements/typography';
import type { Platform } from '@repo/helpers/checkers';
import type { BurnCaptionsConfig } from '@/lib/types';
import { PinnedVideoItemDownloading } from './pinned-video-item-downloading';
import { PinnedVideoItemClient } from './pinned-video-item-client';
import { PinnedVideoItemServer } from './pinned-video-item-server';
import {
  ReadOnlyVideoItem,
  type ReprocessAction,
} from './readonly-video-item';
import { VideoToolbar } from './video-toolbar';
import type { StoredVideo, VideoStatus } from './use-video-store';
import { useSearchQuery, setSearchQuery } from './use-search-store';
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
  onDuplicateCompleted: (afterUuid: string, newVideo: StoredVideo) => void;
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
  onDuplicateCompleted,
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

    /* Text search by name / uploader / uploader handle / URL */
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.name?.toLowerCase().includes(q) ||
          v.uploader?.toLowerCase().includes(q) ||
          v.uploader_id?.toLowerCase().includes(q) ||
          v.description?.toLowerCase().includes(q) ||
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

  /* ── Scroll to top of list on page change ────────── */
  const completedTopRef = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    completedTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [safePage]);

  /* ── Scroll to newly duplicated video ────────────── */
  const [pendingScrollUuid, setPendingScrollUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingScrollUuid) return;

    const idx = filtered.findIndex((v) => v.uuid === pendingScrollUuid);
    if (idx === -1) {
      setPendingScrollUuid(null);
      return;
    }

    const targetPage = Math.floor(idx / perPage) + 1;
    if (targetPage !== safePage) {
      setPage(targetPage);
      return;
    }

    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-video-uuid="${pendingScrollUuid}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setPendingScrollUuid(null);
    });

    return () => cancelAnimationFrame(raf);
  }, [pendingScrollUuid, filtered, safePage, perPage]);

  /* ── Reprocess handler: move completed → pinned ──── */
  const handleReprocess = useCallback(
    (
      uuid: string,
      action: ReprocessAction,
      extra?: number,
      config?: BurnCaptionsConfig,
    ) => {
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
        case 'h265':
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
        case 'burnCaptions':
          onReprocessCompleted(uuid, {
            status: 'burning' as VideoStatus,
            burnCaptionsConfig: config ?? null,
            captionsBurned: false,
          });
          break;
        case 'scaleDown':
          onReprocessCompleted(uuid, {
            status: 'processing' as VideoStatus,
            scaleDownTargetHeight: extra as number,
          });
          break;
        case 'diarize':
          onReprocessCompleted(uuid, {
            status: 'diarizing' as VideoStatus,
          });
          break;
      }
    },
    [onReprocessCompleted],
  );

  /* ── Empty state ────────────────────────────────── */
  if (totalCount === 0) {
    return (
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        padding="32px 16px"
        marginTop={16}
      >
        <Typography
          variant="body"
          color="var(--foreground-muted, #999)"
          styles={{ fontSize: 13, fontWeight: 500, opacity: 0.6 }}
        >
          {t('emptyState')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className="vg-wrapper" width="100%" marginTop={16}>
      <Box
        display="flex"
        alignItems="center"
        gap={8}
        marginBottom={12}
        padding="0 2px"
      >
        <Typography
          as="h2"
          variant="h2"
          color="var(--foreground, #171717)"
          fontWeight={700}
          styles={{ fontSize: 15, letterSpacing: '-0.02em' }}
        >
          {t('title')}
        </Typography>
        <Typography
          variant="body-sm"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          minWidth="22px"
          height="22px"
          padding="0 6px"
          borderRadius="999px"
          color="var(--accent-foreground, white)"
          backgroundColor="var(--accent, #06b6d4)"
          styles={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em' }}
        >
          {totalCount}
        </Typography>
      </Box>

      {/* ── Pinned: active-processing items with own FFmpeg instances ── */}
      {pinned.length > 0 ? (
        <Box className="vg-pinned" marginBottom={20}>
          <Box
            display="flex"
            alignItems="center"
            gap={8}
            marginBottom={12}
            padding="0 2px"
          >
            <Typography
              as="h3"
              variant="h3"
              color="var(--foreground-muted, #999)"
              fontWeight={700}
              styles={{
                fontSize: 11,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {t('processingTitle')}
            </Typography>
            <Typography
              variant="body-sm"
              display="inline-flex"
              alignItems="center"
              justifyContent="center"
              minWidth="22px"
              height="22px"
              padding="0 6px"
              borderRadius="999px"
              color="var(--accent-foreground, white)"
              backgroundColor="var(--accent, #06b6d4)"
              styles={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              {pinned.length}
            </Typography>
          </Box>
          <Grid container spacing={2}>
            {pinned.map((video) => {
              const isDownloading =
                video.status === 'pending' ||
                video.status === 'downloading' ||
                video.status === 'queued';
              const isServerMode = video.useServerProcessing === true;

              return (
                <Grid key={video.uuid} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  {isDownloading ? (
                    <PinnedVideoItemDownloading
                      video={video}
                      onUpdate={onUpdatePinned}
                      onComplete={onCompletePinned}
                      onRemove={onRemovePinned}
                    />
                  ) : isServerMode ? (
                    <PinnedVideoItemServer
                      video={video}
                      onUpdate={onUpdatePinned}
                      onComplete={onCompletePinned}
                      onRemove={onRemovePinned}
                    />
                  ) : (
                    <PinnedVideoItemClient
                      video={video}
                      onUpdate={onUpdatePinned}
                      onComplete={onCompletePinned}
                      onRemove={onRemovePinned}
                    />
                  )}
                </Grid>
              );
            })}
          </Grid>
        </Box>
      ) : null}

      <div ref={completedTopRef} />
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

      {searchQuery && (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          padding="7px 12px"
          borderRadius={8}
          backgroundColor="color-mix(in srgb, var(--accent, #06b6d4) 10%, transparent)"
          marginBottom={12}
        >
          <Typography
            variant="body-sm"
            color="var(--accent, #06b6d4)"
            fontWeight={500}
          >
            {t('searchActive', { query: searchQuery })}
          </Typography>
          <Button
            onClick={() => setSearchQuery('')}
            aria-label={t('clearSearch')}
            text={t('clearSearch')}
            kind="warning"
          />
        </Box>
      )}

      {pageVideos.length === 0 ? (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          padding="24px 16px"
        >
          <Typography
            variant="body"
            color="var(--foreground-muted, #999)"
            styles={{ fontSize: 13, fontWeight: 500, opacity: 0.6 }}
          >
            {t('noResults')}
          </Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {pageVideos.map((video) => (
            <Grid key={video.uuid} size={{ xs: 12, sm: 6, md: 4, lg: 3 }} data-video-uuid={video.uuid}>
              <ReadOnlyVideoItem
                video={video}
                onReprocess={handleReprocess}
                onRemove={onRemoveCompleted}
                onUpdate={onUpdateCompleted}
                onDuplicate={(newVideo) => {
                  onDuplicateCompleted(video.uuid, newVideo);
                  setPendingScrollUuid(newVideo.uuid);
                }}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

export default VideoGrid;
