"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
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
 * So every file is drawn through a canvas at `MAX_EDGE` first. The API still
 * resizes what arrives (`REGULAR`, 1200 px) - this is about what fits in the
 * request, not about the stored image.
 *
 * **Order is meaning, not arrangement.** The API publishes a record's first
 * gallery row as its cover, so photo 1 is the cover - which is why the tiles are
 * numbered and carry a "make cover" control rather than a drag handle. Dragging
 * works on a mouse and is miserable on a touchscreen, and this is a phone-first
 * surface.
 */

/** The longest edge a submitted photo is scaled to before encoding. */
const MAX_EDGE = 1600;

/** JPEG quality for the re-encode. 0.82 is where the size curve flattens. */
const QUALITY = 0.82;

export interface PickedPhoto {
  /** Stable across re-orders, so React keeps the right tile mounted. */
  key: string;
  /** The data URL, downscaled and re-encoded - what is POSTed. */
  dataUrl: string;
  /** The original file's name, for the alt text and the review stage. */
  name: string;
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
          {photos.map((photo, index) => (
            <Box
              key={photo.key}
              className="contribute-photo"
              width="100%"
              height={120}
              borderRadius={10}
              border="1px solid var(--border, rgba(0,0,0,0.08))"
              backgroundColor="var(--surface-2, #f3f4f6)"
              styles={{ position: "relative", overflow: "hidden" }}
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
            </Box>
          ))}
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
 * 1200 px gallery, and a 12-megapixel PNG straight off a screenshot-happy phone
 * would otherwise re-encode to something larger than the original.
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
