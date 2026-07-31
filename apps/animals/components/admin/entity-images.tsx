"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";

interface FieldState {
  existing: { id: number; url: string }[];
  pending: NewImage[];
}

export interface EntityImages {
  fields: readonly string[];
  state: Record<string, FieldState>;
  /** Fill the uploaders from a record just loaded from the API. */
  hydrate: (record: Record<string, unknown>) => void;
  onChange: (field: string, next: NewImage[], keptExistingIds: number[]) => void;
  /** The image half of a save payload. */
  payload: () => Record<string, unknown>;
  /** Whether a field currently holds an image - saved or picked but not yet saved. */
  has: (field: string) => boolean;
}

/**
 * The two fields whose payload key or label key is not simply the field's own
 * name. Everything else reads and labels itself under the name it is declared
 * with, which is what keeps adding a third image field a one-word change.
 *
 * ⚠ **`image` reads from `main_image`, and that is load-bearing.** The payload's
 * `image` is the cover the site *renders*, which the API derives - the record's
 * own column when it has one, else its first gallery photo. Hydrating this
 * uploader from it would show a photograph nobody chose as though somebody had,
 * and pressing remove would then send `image: null`, clearing an already-empty
 * column while the gallery cover stayed exactly where it was - a delete that
 * reads as broken. `main_image` is the column alone, so the uploader is empty
 * precisely when the column is. Writing still goes to `image`; only the read
 * side differs.
 *
 * The label is separate because `Admin.image` is already the "Image" column
 * header on three list pages and must not be repurposed into "Main Image".
 */
const FIELD_META: Record<string, { read?: string; label?: string }> = {
  image: { read: "main_image", label: "mainImage" },
};

/**
 * State for a record's single-image fields (`image`, `icon`, …).
 *
 * The API's write serializers take each image as a base64 string and treat an
 * **omitted** key as "leave the stored file alone" and an **explicitly empty**
 * one as "clear it" (see `Base64ImagesMixin`). `payload()` is what encodes that
 * distinction: a field with a pending upload sends its data URI, a field whose
 * existing image was removed sends `null`, and a field nobody touched sends
 * nothing at all - which is what makes saving a typo fix safe for the photos.
 */
export function useEntityImages(fields: readonly string[]): EntityImages {
  const [state, setState] = useState<Record<string, FieldState>>(() =>
    Object.fromEntries(fields.map((f) => [f, { existing: [], pending: [] }])),
  );

  const hydrate = useCallback(
    (record: Record<string, unknown>) =>
      setState(() =>
        Object.fromEntries(
          fields.map((field) => {
            const url = record[FIELD_META[field]?.read ?? field];
            // `id: 0` is a stand-in: there is exactly one image per field, so
            // the uploader only needs the id to be stable within the field.
            return [field, { existing: url ? [{ id: 0, url: String(url) }] : [], pending: [] }];
          }),
        ),
      ),
    // `fields` is a literal array at every call site, so it is stable in
    // practice; spelling it as a dep would re-create this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onChange = useCallback(
    (field: string, next: NewImage[], keptExistingIds: number[]) =>
      setState((prev) => ({
        ...prev,
        [field]: {
          existing: (prev[field]?.existing ?? []).filter((img) =>
            keptExistingIds.includes(img.id),
          ),
          pending: next,
        },
      })),
    [],
  );

  const payload = useCallback((): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    Object.entries(state).forEach(([field, value]) => {
      if (value.pending.length > 0) out[field] = value.pending[0]?.base64;
      else if (value.existing.length === 0) out[field] = null;
    });
    return out;
  }, [state]);

  // Counts a photo the author has picked but not yet saved, so the gallery below
  // stops promising to be the cover the moment a main image is chosen rather
  // than one Save later.
  const has = useCallback(
    (field: string) => {
      const value = state[field];
      if (!value) return false;
      return value.pending.length > 0 || value.existing.length > 0;
    },
    [state],
  );

  return useMemo(
    () => ({ fields, state, hydrate, onChange, payload, has }),
    [fields, state, hydrate, onChange, payload, has],
  );
}

/**
 * The uploaders themselves, side by side, for `AdminForm`'s `imagesSlot`.
 *
 * Each field's label comes from the `Admin` namespace under its own name
 * (`icon`, `poster`), so a new field needs a key rather than a branch -
 * `FIELD_META` above holds the one exception and why it is one.
 *
 * The `image` field carries a caption the others do not, because it is the only
 * one whose *empty* state means something: left alone, the record's cover is the
 * first photo in the gallery below, and an author has no way to know that from
 * an empty box.
 */
export function PairedImageFields({ images }: { images: EntityImages }) {
  const t = useTranslations("Admin");

  return (
    <Box display="flex" gap={24} flexWrap="wrap">
      {images.fields.map((field) => (
        <Box key={field} flexDirection="column" gap={8} minWidth={200} maxWidth={280}>
          <Typography variant="label">{t(FIELD_META[field]?.label ?? field)}</Typography>
          {field === "image" && (
            <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
              {t("mainImageIntro")}
            </Typography>
          )}
          <AdminImageUploader
            existingImages={images.state[field]?.existing ?? []}
            onChange={(next, _deleted, kept) => images.onChange(field, next, kept)}
            maxImages={1}
            compact
          />
        </Box>
      ))}
    </Box>
  );
}
