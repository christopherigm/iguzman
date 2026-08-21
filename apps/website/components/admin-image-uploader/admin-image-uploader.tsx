"use client";

import { useState, useRef, useCallback, DragEvent } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { MoveHandle } from "@repo/ui/core-elements/move-handle";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import "./admin-image-uploader.css";

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
  /**
   * Renders a square, single-line dropzone that fits a grid cell. For
   * side-by-side single-image fields; leave off for full-width galleries.
   */
  compact?: boolean;
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
  | { kind: "existing"; id: number; url: string; sortOrder: number }
  | { kind: "new"; key: string; preview: string; base64: string; file: File };

/** The stored images a parent passed, as the entries the thumbnail grid renders. */
function toEntries(images: ExistingImage[]): ImageEntry[] {
  return images
    .filter((img) => Boolean(img.url))
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((img, i) => ({
      kind: "existing",
      id: img.id,
      url: img.url,
      sortOrder: i,
    }));
}

export function AdminImageUploader({
  existingImages = [],
  onChange,
  maxImages = 20,
  accept = "image/*",
  label,
  compact = false,
}: AdminImageUploaderProps) {
  const t = useTranslations("AdminImageUploader");
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [entries, setEntries] = useState<ImageEntry[]>(() =>
    toEntries(existingImages),
  );
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  /** Whether the operator has changed anything here - queued a file, deleted a
   *  thumbnail, re-ordered one. Guards the sync below, and so is state rather
   *  than a ref: it is read while rendering. */
  const [touched, setTouched] = useState(false);

  /**
   * Adopt the stored images when they arrive **after** this component mounted.
   *
   * ⚠ **A CMS form renders before its record has loaded.** Every admin detail
   * page mounts the whole form - uploaders included - while its `GET` is still
   * in flight, so the first `existingImages` this component sees is `[]` and the
   * row's stored photo only turns up a render later. `entries` is seeded by a
   * `useState` initializer, which never runs again: without this, a saved main
   * image and a saved gallery were invisible on every page load, and only
   * appeared right after a save - which remounts the uploader through its `key`.
   *
   * Compared by id+url+order rather than by array identity (the parents build a
   * fresh literal on every keystroke), and **skipped once the operator has
   * touched the control**: their pending files, deletions and re-ordering are
   * the newer truth, and the `existingImages` coming back down is derived from
   * them. Adjusting state during render is the deliberate pattern here - an
   * effect would paint the empty grid first.
   */
  const signature = existingImages
    .map((img) => `${img.id}:${img.url}:${img.sort_order ?? 0}`)
    .join("|");
  const [syncedSignature, setSyncedSignature] = useState(signature);
  if (signature !== syncedSignature && !touched) {
    setSyncedSignature(signature);
    setEntries(toEntries(existingImages));
  }

  const notify = useCallback(
    (nextEntries: ImageEntry[], nextDeletedIds: number[]) => {
      if (!onChange) return;
      const newImages = nextEntries
        .filter(
          (e): e is Extract<ImageEntry, { kind: "new" }> => e.kind === "new",
        )
        .map((e) => ({ base64: e.base64, preview: e.preview, file: e.file }));
      const orderedExistingIds = nextEntries
        .filter(
          (e): e is Extract<ImageEntry, { kind: "existing" }> =>
            e.kind === "existing",
        )
        .map((e) => e.id);
      onChange(newImages, nextDeletedIds, orderedExistingIds);
    },
    [onChange],
  );

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      const available = maxImages - entries.length;
      const toAdd = fileArray.slice(0, Math.max(0, available));
      if (toAdd.length === 0) return;
      setTouched(true);

      const newEntries: ImageEntry[] = await Promise.all(
        toAdd.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            kind: "new" as const,
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
    setTouched(true);
    const next = entries.filter((_, i) => i !== index);
    let nextDeleted = deletedIds;
    if (entry.kind === "existing") {
      nextDeleted = [...deletedIds, entry.id];
      setDeletedIds(nextDeleted);
    }
    setEntries(next);
    notify(next, nextDeleted);
  };

  /**
   * Downloads the file the API stores, not the `next/image` derivative the
   * thumbnail renders - `url` is the API's own media URL, so the bytes are the
   * original upload at full size and in its original format.
   */
  const handleDownload = useCallback(async (url: string) => {
    const filename = url.split("/").pop()?.split("?")[0] || "image";
    try {
      // The API is a different origin, so the browser ignores a plain
      // `download` attribute on an anchor pointing at it; read the bytes and
      // hand the anchor a same-origin blob URL instead.
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const objectUrl = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      // Media served without CORS headers can't be read as a blob (the admin
      // routes also run under COEP `require-corp`) - fall back to opening the
      // original in a new tab so the file stays reachable.
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

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
    setTouched(true);
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

  const dropzone = (
    <div
      className={`aiu__dropzone${compact ? " aiu__dropzone--compact" : ""}${isDragOver ? " aiu__dropzone--active" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      aria-label={t("dropzoneLabel")}
    >
      <span className="aiu__dropzone-icon">🖼️</span>
      <Typography
        as="span"
        variant={compact ? "caption" : "body"}
        fontWeight={600}
        color="var(--foreground)"
      >
        {compact ? t("dropzoneTextCompact") : t("dropzoneText")}
      </Typography>
      {!compact && (
        <Typography as="span" variant="caption" color="var(--foreground)">
          {t("dropzoneHint")}
        </Typography>
      )}
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
  );

  return (
    <Box flexDirection="column" gap={12}>
      {label && (
        <Typography
          as="span"
          variant="label"
          fontWeight={600}
          color="var(--foreground)"
        >
          {label}
        </Typography>
      )}

      {/* Drop zone. In compact mode it goes through the same grid the thumbnails
          use, so an empty field is one square cell rather than a full-width one:
          the field keeps the size it will have once an image is in it, instead of
          collapsing from a large empty square to a small thumbnail. */}
      {canAdd &&
        (compact ? <Box className="aiu__grid">{dropzone}</Box> : dropzone)}

      {/* Thumbnail grid */}
      {entries.length > 0 && (
        <Box className="aiu__grid">
          {entries.map((entry, index) => {
            const url = entry.kind === "existing" ? entry.url : entry.preview;
            const isDragging = dragIndex === index;
            const isOver = dragOverIndex === index && dragIndex !== index;
            return (
              <div
                key={
                  entry.kind === "existing" ? `existing-${entry.id}` : entry.key
                }
                className={`aiu__thumb${isDragging ? " aiu__thumb--dragging" : ""}${isOver ? " aiu__thumb--over" : ""}`}
                draggable
                onDragStart={() => handleItemDragStart(index)}
                onDragOver={(e) => handleItemDragOver(e, index)}
                onDrop={(e) => handleItemDrop(e, index)}
                onDragEnd={handleItemDragEnd}
              >
                <Box styles={{ position: "absolute", inset: 0 }}>
                  <Image
                    src={url}
                    alt=""
                    fill
                    unoptimized={entry.kind === "new"}
                    style={{ objectFit: "cover" }}
                  />
                </Box>
                <Box
                  className="aiu__thumb-overlay"
                  flexDirection="column"
                  justifyContent="space-between"
                  padding={4}
                >
                  <Box justifyContent="space-between" alignItems="flex-start">
                    {/* The whole thumbnail is the drag source, so the handle is
                        only the affordance that says so - hence `decorative`. */}
                    <MoveHandle decorative variant="overlay" size="sm" />
                    <IconButton
                      size="sm"
                      kind="error"
                      solid
                      icon="/icons/delete-trash-icon.svg"
                      aria-label={t("deleteImage")}
                      title={t("deleteImage")}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(index);
                      }}
                    />
                  </Box>
                  {/* Only a saved image has an API file to fetch; a pending
                      upload is still just a local base64 preview. */}
                  {entry.kind === "existing" && (
                    <Box justifyContent="flex-end" alignItems="flex-end">
                      <IconButton
                        size="sm"
                        kind="default"
                        solid
                        icon="/icons/download.svg"
                        aria-label={t("downloadImage")}
                        title={t("downloadImage")}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(entry.url);
                        }}
                      />
                    </Box>
                  )}
                </Box>
                {index === 0 && (
                  <Badge
                    variant="filled"
                    size="sm"
                    color="var(--accent)"
                    textColor="white"
                    uppercase
                    style={{
                      position: "absolute",
                      bottom: 4,
                      left: 4,
                    }}
                  >
                    {t("main")}
                  </Badge>
                )}
              </div>
            );
          })}
        </Box>
      )}

      {entries.length === 0 && !canAdd && (
        <Typography
          variant="body"
          textAlign="center"
          padding={8}
          color="var(--foreground)"
        >
          {t("maxReached")}
        </Typography>
      )}
    </Box>
  );
}
