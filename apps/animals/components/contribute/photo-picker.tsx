"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { MoveHandle } from "@repo/ui/core-elements/move-handle";
import { Typography } from "@repo/ui/core-elements/typography";
import { MAX_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/contribute";
import "./photo-picker.css";

/**
 * The photo stage of the public contribute flow: pick files, see them, choose
 * which one leads.
 *
 * **It is not `AdminImageUploader`, and the difference is downscaling.** That
 * component base64s the file exactly as the author picked it, which is fine in the
 * CMS: an author uploads one considered photograph at a time from a machine, and
 * animals-api resizes on receipt. A contributor is on a phone, choosing four shots
 * straight out of the camera roll at 4-6 MB each - and base64 inflates a file by
 * about a third, so those four arrive as a ~30 MB JSON body against Django's 10 MB
 * `DATA_UPLOAD_MAX_MEMORY_SIZE`. The submission would fail *after* the upload, on
 * a mobile connection, with the draft still on screen and nothing to do about it.
 * So every file is drawn through a canvas at `MAX_EDGE` first. This is about what
 * fits in the request, not about the stored image.
 *
 * ⚠ `MAX_EDGE` is **below** the tier the API stores at (`REGULAR_PLUS`, 2560 px),
 * and that gap is deliberate rather than an oversight to close. Ten photos is the
 * ceiling, and ten 2560 px JPEGs base64 to well past the 10 MB the request is
 * allowed to be - so raising this to match the tier would trade a slightly sharper
 * contribution for submissions that fail outright on a full picker. A contributor's
 * photo is stored at whatever arrives; the CMS's `AdminImageUploader`, which sends
 * one considered file as picked, is the path that actually reaches 2560.
 *
 * **Order is meaning, not arrangement.** The API publishes a record's first
 * gallery row as its cover, so photo 1 is the cover - which is why the tiles are
 * numbered.
 *
 * Re-ordering therefore has **two** controls, and both are needed. The move
 * handle (`@repo/ui`'s `MoveHandle`) is the CMS uploader's, behaviour for
 * behaviour: the whole tile is the HTML5 drag source, the handle is the
 * affordance that says so - hence `decorative` - and a drop splices the dragged
 * photo in at the target's index. But HTML5 drag-and-drop
 * does not exist under a finger - `dragstart` never fires for a touch - and this
 * is a phone-first surface, so the "use as cover" button stays as the one-tap
 * way to make the choice that actually carries meaning. Don't remove it in
 * favour of the handle.
 */

/** The longest edge a submitted photo is scaled to before encoding. */
const MAX_EDGE = 1600;

/** JPEG quality for the re-encode. 0.82 is where the size curve flattens. */
const QUALITY = 0.82;

export interface PickedPhoto {
  /** Stable across re-orders, so React keeps the right tile mounted. */
  key: string;
  /**
   * What the tile displays: a downscaled data URL for a photo just picked, or
   * the stored file's URL for one already on the record (see `id`).
   */
  dataUrl: string;
  /** The original file's name, for the alt text and the review stage. */
  name: string;
  /**
   * The gallery row this tile already **is**, when the picker is editing a
   * record rather than filing one.
   *
   * ⚠ Its presence is what decides how the tile is submitted: a row with an `id`
   * travels as `{id}` (keep it, at this position), and one without as
   * `{image: dataUrl}` (add it). A stored photo is therefore never re-uploaded
   * by an edit that only re-orders - which matters on a phone, where the whole
   * gallery would otherwise go back up to move the cover. See `photoPatch` in
   * `lib/contributions.ts` and `photos_patch_field` on the API side.
   */
  id?: number;
}

interface Props {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
}

export function PhotoPicker({ photos, onChange }: Props) {
  const t = useTranslations("Contribute");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const addFiles = useCallback(
    async (files: FileList) => {
      const images = Array.from(files).filter((file) =>
        file.type.startsWith("image/"),
      );
      if (images.length === 0) return;

      setError(null);
      const room = MAX_PHOTOS - photos.length;
      if (room <= 0) {
        setError(t("photoTooMany"));
        return;
      }
      if (images.length > room) setError(t("photoTooMany"));

      setBusy(true);
      try {
        const added: PickedPhoto[] = [];
        for (const file of images.slice(0, room)) {
          if (file.size > MAX_PHOTO_BYTES) {
            setError(t("photoTooLarge"));
            continue;
          }
          try {
            added.push({
              key: `${file.name}-${Date.now()}-${added.length}`,
              dataUrl: await downscale(file),
              name: file.name,
            });
          } catch {
            // A file the browser cannot decode - a HEIC on a browser without
            // native support, a renamed non-image. Reported once and skipped
            // rather than failing the whole selection.
            setError(t("photoUnreadable"));
          }
        }
        if (added.length > 0) onChange([...photos, ...added]);
      } finally {
        setBusy(false);
        // Cleared so re-picking the same file fires `change` again.
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [t, onChange, photos],
  );

  const remove = (key: string) => {
    setError(null);
    onChange(photos.filter((photo) => photo.key !== key));
  };

  const makeCover = (key: string) => {
    const picked = photos.find((photo) => photo.key === key);
    if (!picked) return;
    onChange([picked, ...photos.filter((photo) => photo.key !== key)]);
  };

  const endDrag = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const dropOn = (dropIndex: number) => {
    if (dragIndex === null || dragIndex === dropIndex) {
      endDrag();
      return;
    }
    const next = [...photos];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) {
      endDrag();
      return;
    }
    next.splice(dropIndex, 0, moved);
    endDrag();
    onChange(next);
  };

  // One photo is already in the only order it can be in, so the tile neither
  // shows a handle nor becomes a drag source.
  const canReorder = photos.length > 1;

  return (
    <Box flexDirection="column" gap={12} width="100%">
      {photos.length > 0 && (
        <Box
          display="grid"
          gap={10}
          width="100%"
          styles={{
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          }}
        >
          {photos.map((photo, index) => {
            const isDragging = dragIndex === index;
            const isOver = dragOverIndex === index && dragIndex !== index;
            return (
              <Box
                key={photo.key}
                className={`contribute-photo${canReorder ? " contribute-photo--draggable" : ""}${isDragging ? " contribute-photo--dragging" : ""}`}
                width="100%"
                height={120}
                borderRadius={10}
                // The border is an inline style (it is a Box prop), so the
                // drag-over highlight has to be a prop ternary too - a CSS class
                // could not win against it.
                border={
                  isOver
                    ? "2px solid var(--accent, #06b6d4)"
                    : "1px solid var(--border, rgba(0,0,0,0.08))"
                }
                backgroundColor="var(--surface-2, #f3f4f6)"
                styles={{
                  position: "relative",
                  overflow: "hidden",
                  ...(isDragging ? { opacity: 0.4 } : {}),
                }}
                draggable={canReorder}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(event) => {
                  // Without preventDefault the browser refuses the drop outright.
                  event.preventDefault();
                  setDragOverIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dropOn(index);
                }}
                onDragEnd={endDrag}
              >
                <Image
                  src={photo.dataUrl}
                  alt={photo.name}
                  fill
                  sizes="160px"
                  style={{ objectFit: "cover" }}
                  // A data URL never goes through the image optimiser, and this app
                  // runs a custom loader anyway (`images.loader: 'custom'`), so
                  // `/_next/image` does not answer here at all.
                  unoptimized
                />

                <Box
                  styles={{ position: "absolute", top: 6, left: 6 }}
                  alignItems="center"
                  gap={6}
                >
                  {index === 0 ? (
                    <Badge variant="filled" size="sm" translucent>
                      {t("photoCover")}
                    </Badge>
                  ) : (
                    <Badge variant="subtle" size="sm" circular translucent>
                      {index + 1}
                    </Badge>
                  )}
                </Box>

                <Box
                  styles={{ position: "absolute", top: 4, right: 4 }}
                  gap={2}
                  alignItems="center"
                >
                  {index !== 0 && (
                    <IconButton
                      icon="/icons/star.svg"
                      aria-label={t("photoMakeCover")}
                      title={t("photoMakeCover")}
                      size="sm"
                      kind="warning"
                      solid
                      onClick={() => makeCover(photo.key)}
                    />
                  )}
                  <IconButton
                    icon="/icons/delete.svg"
                    aria-label={t("photoRemove")}
                    title={t("photoRemove")}
                    size="sm"
                    kind="error"
                    solid
                    onClick={() => remove(photo.key)}
                  />
                </Box>

                {/* The move handle. Decorative, exactly as in the CMS uploader:
                  the drag source is the whole tile, so this is the affordance
                  that says the tile can be dragged, not a control of its own -
                  a screen reader is offered the "use as cover" button instead,
                  which is the part of the order that carries meaning. */}
                {canReorder && (
                  <MoveHandle
                    decorative
                    variant="overlay"
                    size="sm"
                    styles={{ position: "absolute", bottom: 4, left: 4 }}
                  />
                )}
              </Box>
            );
          })}
        </Box>
      )}

      <Box flexDirection="column" gap={6} alignItems="flex-start">
        <Button
          text={photos.length === 0 ? t("photoAdd") : t("photoAddMore")}
          icon="/icons/add.svg"
          size="lg"
          kind={photos.length === 0 ? "primary" : undefined}
          disabled={busy || photos.length >= MAX_PHOTOS}
          onClick={() => inputRef.current?.click()}
        />
        <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
          {busy
            ? t("photoWorking")
            : photos.length === 0
              ? t("photoEmpty")
              : t("photoCounter", { count: photos.length, max: MAX_PHOTOS })}
        </Typography>
        {error && (
          <Typography variant="caption" color="var(--error, #ef4444)">
            {error}
          </Typography>
        )}
      </Box>

      {/* Programmatically triggered by the button above, so it is hidden from the
          accessibility tree rather than labelled - see apps/CLAUDE.md. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        aria-hidden="true"
        className="contribute-photo-input"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files);
        }}
      />
    </Box>
  );
}

/**
 * A file as a downscaled JPEG data URL.
 *
 * `createImageBitmap` rather than an `<img>`: it decodes off the main thread, so
 * picking six photos does not freeze the page mid-flow, and it honours the EXIF
 * orientation tag (`imageOrientation: 'from-image'`) - without which every photo
 * taken in portrait on a phone arrives on its side, which is exactly the kind of
 * thing nobody notices until a contributor's whole album is rotated.
 *
 * The result is always JPEG, whatever went in: this is a photograph bound for a
 * gallery, and a 12-megapixel PNG straight off a screenshot-happy phone would
 * otherwise re-encode to something larger than the original.
 */
async function downscale(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No 2D context");
    context.drawImage(bitmap, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", QUALITY);
  } finally {
    bitmap.close();
  }
}
