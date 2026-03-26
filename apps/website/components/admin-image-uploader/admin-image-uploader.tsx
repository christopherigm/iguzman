'use client';

import { useState, useRef, useCallback, DragEvent } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import './admin-image-uploader.css';

export interface ExistingImage {
  id: number;
  url: string;
  sort_order?: number;
}

export interface NewImage {
  base64: string;
  preview: string;
  file: File;
}

interface AdminImageUploaderProps {
  existingImages?: ExistingImage[];
  onChange?: (
    newImages: NewImage[],
    deletedIds: number[],
    orderedExistingIds: number[],
  ) => void;
  maxImages?: number;
  accept?: string;
  label?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type ImageEntry =
  | { kind: 'existing'; id: number; url: string; sortOrder: number }
  | { kind: 'new'; key: string; preview: string; base64: string; file: File };

export function AdminImageUploader({
  existingImages = [],
  onChange,
  maxImages = 20,
  accept = 'image/*',
  label,
}: AdminImageUploaderProps) {
  const t = useTranslations('AdminImageUploader');
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [entries, setEntries] = useState<ImageEntry[]>(() =>
    existingImages
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((img, i) => ({
        kind: 'existing',
        id: img.id,
        url: img.url,
        sortOrder: i,
      })),
  );
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const notify = useCallback(
    (nextEntries: ImageEntry[], nextDeletedIds: number[]) => {
      if (!onChange) return;
      const newImages = nextEntries
        .filter(
          (e): e is Extract<ImageEntry, { kind: 'new' }> => e.kind === 'new',
        )
        .map((e) => ({ base64: e.base64, preview: e.preview, file: e.file }));
      const orderedExistingIds = nextEntries
        .filter(
          (e): e is Extract<ImageEntry, { kind: 'existing' }> =>
            e.kind === 'existing',
        )
        .map((e) => e.id);
      onChange(newImages, nextDeletedIds, orderedExistingIds);
    },
    [onChange],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        f.type.startsWith('image/'),
      );
      const available = maxImages - entries.length;
      const toAdd = fileArray.slice(0, Math.max(0, available));
      if (toAdd.length === 0) return;

      const newEntries: ImageEntry[] = await Promise.all(
        toAdd.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            kind: 'new' as const,
            key: `${file.name}-${Date.now()}-${Math.random()}`,
            preview: base64,
            base64,
            file,
          };
        }),
      );
      const next = [...entries, ...newEntries];
      setEntries(next);
      notify(next, deletedIds);
    },
    [entries, deletedIds, maxImages, notify],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const handleDelete = (index: number) => {
    const entry = entries[index];
    if (!entry) return;
    const next = entries.filter((_, i) => i !== index);
    let nextDeleted = deletedIds;
    if (entry.kind === 'existing') {
      nextDeleted = [...deletedIds, entry.id];
      setDeletedIds(nextDeleted);
    }
    setEntries(next);
    notify(next, nextDeleted);
  };

  // Drag-to-reorder
  const handleItemDragStart = (index: number) => setDragIndex(index);
  const handleItemDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };
  const handleItemDrop = (e: DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const next = [...entries];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) return;
    next.splice(dropIndex, 0, moved);
    setEntries(next);
    setDragIndex(null);
    setDragOverIndex(null);
    notify(next, deletedIds);
  };
  const handleItemDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const canAdd = entries.length < maxImages;

  return (
    <Box className="aiu">
      {label && (
        <Typography as="span" variant="label" className="aiu__label">
          {label}
        </Typography>
      )}

      {/* Drop zone */}
      {canAdd && (
        <div
          className={`aiu__dropzone${isDragOver ? ' aiu__dropzone--active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          aria-label={t('dropzoneLabel')}
        >
          <span className="aiu__dropzone-icon">🖼️</span>
          <Typography
            as="span"
            variant="body-sm"
            className="aiu__dropzone-text"
          >
            {t('dropzoneText')}
          </Typography>
          <Typography
            as="span"
            variant="caption"
            className="aiu__dropzone-hint"
          >
            {t('dropzoneHint')}
          </Typography>
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple
            className="aiu__input"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
            tabIndex={-1}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Thumbnail grid */}
      {entries.length > 0 && (
        <Box className="aiu__grid">
          {entries.map((entry, index) => {
            const url = entry.kind === 'existing' ? entry.url : entry.preview;
            const isDragging = dragIndex === index;
            const isOver = dragOverIndex === index && dragIndex !== index;
            return (
              <div
                key={
                  entry.kind === 'existing' ? `existing-${entry.id}` : entry.key
                }
                className={`aiu__thumb${isDragging ? ' aiu__thumb--dragging' : ''}${isOver ? ' aiu__thumb--over' : ''}`}
                draggable
                onDragStart={() => handleItemDragStart(index)}
                onDragOver={(e) => handleItemDragOver(e, index)}
                onDrop={(e) => handleItemDrop(e, index)}
                onDragEnd={handleItemDragEnd}
              >
                <Box className="aiu__thumb-img-wrap">
                  <Image
                    src={url}
                    alt=""
                    fill
                    className="aiu__thumb-img"
                    unoptimized={entry.kind === 'new'}
                  />
                </Box>
                <Box className="aiu__thumb-overlay">
                  <span className="aiu__thumb-drag-handle" aria-hidden="true">
                    ⠿
                  </span>
                  <Button
                    unstyled
                    type="button"
                    className="aiu__thumb-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    aria-label={t('deleteImage')}
                  >
                    ✕
                  </Button>
                </Box>
                {index === 0 && (
                  <Typography
                    as="span"
                    variant="caption"
                    className="aiu__thumb-badge"
                  >
                    {t('main')}
                  </Typography>
                )}
              </div>
            );
          })}
        </Box>
      )}

      {entries.length === 0 && !canAdd && (
        <Typography variant="body-sm" className="aiu__empty">
          {t('maxReached')}
        </Typography>
      )}
    </Box>
  );
}
