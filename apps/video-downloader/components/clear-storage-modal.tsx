'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { Icon } from '@repo/ui/core-elements/icon';
import { listOPFSFiles, deleteFromOPFS } from '@/lib/opfs';
import './clear-storage-modal.css';

/* ── Constants ──────────────────────────────────────── */

const COMPLETED_KEY = 'vd_completed_v2';
const MB_30 = 30 * 1024 * 1024;
const MB_100 = 100 * 1024 * 1024;

/* ── Types ──────────────────────────────────────────── */

interface StoredEntry {
  uuid: string;
  name: string | null;
  originalURL: string;
  justAudio: boolean;
  opfsEnabled: boolean;
  fileSize: number | null;
  opfsKey: string | null;
  opfsThumbnailKey: string | null;
  opfsCaptionsKey: string | null;
  opfsCommentsKey: string | null;
}

interface OPFSFile {
  name: string;
  size: number;
}

type CategoryKey = 'orphan' | 'audio' | 'large' | 'medium' | 'other';

interface CategoryData {
  records: StoredEntry[];
  orphanFiles: OPFSFile[];
  totalSize: number;
}

export interface ClearStorageModalProps {
  onClose: () => void;
  onRemoveVideosByUuids: (uuids: string[]) => void;
}

/* ── Helpers ────────────────────────────────────────── */

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function readStoredEntries(): StoredEntry[] {
  try {
    const raw = localStorage.getItem(COMPLETED_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as StoredEntry[];
    return all.filter((v) => v.opfsEnabled);
  } catch {
    return [];
  }
}

function buildCategories(
  entries: StoredEntry[],
  opfsFiles: OPFSFile[],
): Record<CategoryKey, CategoryData> {
  /* Build a set of all OPFS keys referenced by localStorage records */
  const referencedKeys = new Set<string>();
  for (const e of entries) {
    if (e.opfsKey) referencedKeys.add(e.opfsKey);
    if (e.opfsThumbnailKey) referencedKeys.add(e.opfsThumbnailKey);
    if (e.opfsCaptionsKey) referencedKeys.add(e.opfsCaptionsKey);
    if (e.opfsCommentsKey) referencedKeys.add(e.opfsCommentsKey);
  }

  const orphanFiles = opfsFiles.filter((f) => !referencedKeys.has(f.name));

  /* Mutually exclusive categories — priority: audio > large > medium > other */
  const audio: StoredEntry[] = [];
  const large: StoredEntry[] = [];
  const medium: StoredEntry[] = [];
  const other: StoredEntry[] = [];

  for (const e of entries) {
    if (e.justAudio) {
      audio.push(e);
    } else if (e.fileSize !== null && e.fileSize > MB_100) {
      large.push(e);
    } else if (e.fileSize !== null && e.fileSize >= MB_30) {
      medium.push(e);
    } else {
      other.push(e);
    }
  }

  const sumRecordSize = (recs: StoredEntry[]) =>
    recs.reduce((acc, r) => acc + (r.fileSize ?? 0), 0);
  const sumOrphanSize = (files: OPFSFile[]) =>
    files.reduce((acc, f) => acc + f.size, 0);

  return {
    orphan: {
      records: [],
      orphanFiles,
      totalSize: sumOrphanSize(orphanFiles),
    },
    audio: { records: audio, orphanFiles: [], totalSize: sumRecordSize(audio) },
    large: { records: large, orphanFiles: [], totalSize: sumRecordSize(large) },
    medium: {
      records: medium,
      orphanFiles: [],
      totalSize: sumRecordSize(medium),
    },
    other: { records: other, orphanFiles: [], totalSize: sumRecordSize(other) },
  };
}

/* ── Category metadata ──────────────────────────────── */

const CATEGORY_KEYS: CategoryKey[] = [
  'orphan',
  'audio',
  'large',
  'medium',
  'other',
];

/* ── Component ──────────────────────────────────────── */

export function ClearStorageModal({
  onClose,
  onRemoveVideosByUuids,
}: ClearStorageModalProps) {
  const t = useTranslations('ClearStorageModal');

  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Record<
    CategoryKey,
    CategoryData
  > | null>(null);
  const [clearing, setClearing] = useState<CategoryKey | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<CategoryKey>>(
    new Set(),
  );

  const toggleCategory = useCallback((key: CategoryKey) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* Load OPFS files + localStorage records on mount */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [opfsFiles, entries] = await Promise.all([
        listOPFSFiles(),
        Promise.resolve(readStoredEntries()),
      ]);
      if (cancelled) return;
      setCategories(buildCategories(entries, opfsFiles));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearCategory = useCallback(
    async (key: CategoryKey) => {
      if (!categories || clearing !== null) return;
      const cat = categories[key];
      setClearing(key);

      if (key === 'orphan') {
        /* Orphan files have no localStorage records — just delete the OPFS files */
        for (const file of cat.orphanFiles) {
          await deleteFromOPFS(file.name);
        }
      } else {
        /* Delete all OPFS files referenced by each record */
        for (const rec of cat.records) {
          if (rec.opfsKey) await deleteFromOPFS(rec.opfsKey);
          if (rec.opfsThumbnailKey) await deleteFromOPFS(rec.opfsThumbnailKey);
          if (rec.opfsCaptionsKey) await deleteFromOPFS(rec.opfsCaptionsKey);
          if (rec.opfsCommentsKey) await deleteFromOPFS(rec.opfsCommentsKey);
        }

        /* Remove records from localStorage */
        try {
          const raw = localStorage.getItem(COMPLETED_KEY);
          if (raw) {
            const uuids = new Set(cat.records.map((r) => r.uuid));
            const all = JSON.parse(raw) as StoredEntry[];
            localStorage.setItem(
              COMPLETED_KEY,
              JSON.stringify(all.filter((v) => !uuids.has(v.uuid))),
            );
          }
        } catch {
          /* Malformed storage — leave it */
        }

        /* Remove records from the React grid */
        onRemoveVideosByUuids(cat.records.map((r) => r.uuid));
      }

      /* Zero out this category locally */
      setCategories((prev) =>
        prev
          ? { ...prev, [key]: { records: [], orphanFiles: [], totalSize: 0 } }
          : prev,
      );
      setClearing(null);
    },
    [categories, clearing, onRemoveVideosByUuids],
  );

  const isEmpty =
    categories &&
    CATEGORY_KEYS.every(
      (k) =>
        categories[k].records.length === 0 &&
        categories[k].orphanFiles.length === 0,
    );

  const body = loading ? (
    <div className="csm-loading">
      <Spinner size={32} thickness={3} label={t('title')} />
    </div>
  ) : isEmpty ? (
    <Typography
      variant="body-sm"
      color="var(--foreground-muted, #888)"
      className="csm-empty"
    >
      {t('emptyMessage')}
    </Typography>
  ) : (
    <div className="csm-categories">
      {CATEGORY_KEYS.map((key) => {
        const cat = categories![key];
        const count =
          key === 'orphan' ? cat.orphanFiles.length : cat.records.length;
        if (count === 0) return null;

        const isOpen = openCategories.has(key);
        const files =
          key === 'orphan'
            ? cat.orphanFiles.map((f) => ({
                id: f.name,
                displayName: f.name,
                displaySize: formatBytes(f.size),
              }))
            : cat.records.map((r) => ({
                id: r.uuid,
                displayName: r.name ?? r.opfsKey ?? r.uuid,
                displaySize:
                  r.fileSize !== null ? formatBytes(r.fileSize) : '—',
              }));

        return (
          <div key={key} className="csm-category">
            <div className="csm-category-header">
              <div className="csm-category-info">
                <Typography variant="body-sm" fontWeight={600}>
                  {t(`${key}Title`)}
                </Typography>
                <Typography
                  variant="caption"
                  color="var(--foreground-muted, #888)"
                >
                  {t(`${key}Description`)}
                </Typography>
                <Box display="flex" alignItems="center" gap={6} marginTop={2}>
                  <Typography variant="caption" fontWeight={500}>
                    {t('fileCount', { count })}
                  </Typography>
                  {cat.totalSize > 0 && (
                    <>
                      <span className="csm-dot" />
                      <Typography variant="caption" fontWeight={500}>
                        {formatBytes(cat.totalSize)}
                      </Typography>
                    </>
                  )}
                </Box>
              </div>
              <Button
                text={clearing === key ? t('clearing') : t('clearCategory')}
                onClick={() => void handleClearCategory(key)}
                disabled={clearing !== null}
                size="md"
                kind="error"
              />
            </div>
            <button
              type="button"
              className="csm-toggle"
              onClick={() => toggleCategory(key)}
              aria-label={t('toggleFileList')}
            >
              <Icon
                icon="/icons/chevron-down.svg"
                size={14}
                color="var(--foreground-muted, #999)"
                className={isOpen ? 'csm-chevron--open' : 'csm-chevron--closed'}
              />
            </button>
            <div
              className={`csm-file-panel${
                isOpen ? ' csm-file-panel--open' : ''
              }`}
            >
              <div className="csm-file-inner">
                <div className="csm-file-list">
                  {files.map((f) => (
                    <div key={f.id} className="csm-file-row">
                      <span className="csm-file-name">
                        <Typography variant="caption">
                          {f.displayName}
                        </Typography>
                      </span>
                      <Typography
                        variant="caption"
                        color="var(--foreground-muted, #888)"
                      >
                        {f.displaySize}
                      </Typography>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <ConfirmationModal
      title={t('title')}
      text=""
      okCallback={onClose}
      cancelCallback={onClose}
      panelMaxWidth="480px"
    >
      {body}
    </ConfirmationModal>
  );
}

export default ClearStorageModal;
