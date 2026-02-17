'use client';

import { useTranslations } from 'next-intl';
import { Grid } from '@repo/ui/core-elements/grid';
import { VideoItem } from './video-item';
import type { StoredVideo } from './use-video-store';
import './video-grid.css';

/* ── Props ──────────────────────────────────────────── */

export interface VideoGridProps {
  videos: StoredVideo[];
  onUpdate: (uuid: string, patch: Partial<StoredVideo>) => void;
  onRemove: (uuid: string) => void;
}

/* ── Component ──────────────────────────────────────── */

export function VideoGrid({ videos, onUpdate, onRemove }: VideoGridProps) {
  const t = useTranslations('VideoGrid');

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

      <Grid container spacing={2}>
        {videos.map((video) => (
          <Grid key={video.uuid} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
            <VideoItem video={video} onUpdate={onUpdate} onRemove={onRemove} />
          </Grid>
        ))}
      </Grid>
    </div>
  );
}

export default VideoGrid;
