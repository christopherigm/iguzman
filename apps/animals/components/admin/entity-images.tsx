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
}

/**
 * State for a record's single-image fields.
 *
 * ⚠ **A record's photographs do not come through here** - they are gallery rows
 * (`entity-gallery.tsx`), and the first of them is the record's cover. Today
 * `icon` is the only field any form declares: a 128 px glyph for a map pin or a
 * filter chip, which must never join the gallery or the cover would sometimes be
 * a map pin. The hook stays plural because a second such field (a poster, say)
 * would be one word here rather than a new component.
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
            const url = record[field];
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

  return useMemo(
    () => ({ fields, state, hydrate, onChange, payload }),
    [fields, state, hydrate, onChange, payload],
  );
}

/**
 * The single-image fields, side by side, for `EntityGalleryField`'s `headerSlot`.
 *
 * Each field's label comes from the `Admin` namespace under its own name
 * (`icon`), so a new field needs a translation key rather than a branch here.
 *
 * Deliberately **not** a place a photograph can be uploaded. A record's cover is
 * the first row of the gallery below and nothing else; the "Main Image" uploader
 * that used to stand here let it be picked in a second place, which meant
 * dragging a photo to the front of the gallery could silently do nothing. It was
 * removed, its values were promoted into the galleries
 * (animals-api `catalog.0012_main_image_into_gallery`) and the column behind it
 * was dropped (`0013_drop_main_image`) - so there is no longer anything for a
 * control like that to write.
 */
export function PairedImageFields({ images }: { images: EntityImages }) {
  const t = useTranslations("Admin");

  return (
    <Box display="flex" gap={24} flexWrap="wrap">
      {images.fields.map((field) => (
        <Box key={field} flexDirection="column" gap={8} minWidth={200} maxWidth={280}>
          <Typography variant="label">{t(field)}</Typography>
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
