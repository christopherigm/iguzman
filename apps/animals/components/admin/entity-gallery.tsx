"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import {
  AdminImageUploader,
  type NewImage,
} from "@/components/admin-image-uploader/admin-image-uploader";
import type { ChildResource } from "@/lib/admin-api";

interface ExistingImage {
  id: number;
  url: string;
  sort_order?: number;
}

export interface EntityGallery {
  /** Uploader props - spread nothing, this is read by `<EntityGalleryField />`. */
  existing: ExistingImage[];
  loading: boolean;
  onChange: (
    pending: NewImage[],
    deletedIds: number[],
    orderedExistingIds: number[],
  ) => void;
  /**
   * Write the pending adds, deletes and re-ordering to the API. Call it from the
   * form's own submit, **after** the parent row exists - a new record has no URL
   * to POST a photo to until it has been created.
   */
  persist: (parentId: number) => Promise<void>;
}

/**
 * A record's photo gallery, as one multi-select uploader.
 *
 * ⚠ **The first photo is the record's main image, unless one was chosen.** The
 * API publishes a record's `image` as its own column when it has one and
 * otherwise the first gallery row (`core.serializers.gallery_image_url`). Most
 * records leave that column empty - the Main Image uploader beside this one is
 * optional - so position 1 here is normally the cover, on the card, the hero and
 * every thumbnail, which is what the "MAIN" badge on the first tile means and
 * why a drag to re-order is a real edit rather than housekeeping. Fill the Main
 * Image field and this becomes an ordinary gallery: pass `mainImageSet` so the
 * badge and the caption stop saying otherwise.
 *
 * **Unlike the old one-row-at-a-time editor, nothing here is written until the
 * form is saved.** An author picking eight photos from an outing gets one Save,
 * and abandoning the form leaves nothing behind - including on a brand-new
 * record, which could not have a gallery at all before. The cost is that
 * `persist()` has to be called from the form's submit; `useEntityGallery` cannot
 * do it itself, because only the form knows the id a just-created record got.
 *
 * Captions are deliberately not edited here. Every row still *has* the
 * Spanish/English caption pair (the public gallery renders one when it is there,
 * and the Django admin's inline can set it) - the CMS just uploads photographs,
 * which is what an author actually does with a memory card full of them.
 */
interface GalleryOptions {
  /**
   * Which rows of the collection are photographs. Only `sightingMedia` needs
   * this: it is one ordered list carrying photos, uploaded clips *and* video
   * links (a row has a `kind`), and the two video kinds have no `image` to show.
   */
  filter?: (row: Record<string, unknown>) => boolean;
  /** Merged into every create body - `sightingMedia` uses it to state the kind. */
  createExtras?: Record<string, unknown>;
}

export function useEntityGallery(
  resource: ChildResource,
  parentId: number | null,
  options: GalleryOptions = {},
) {
  const { filter, createExtras } = options;
  const [existing, setExisting] = useState<ExistingImage[]>([]);
  const [pending, setPending] = useState<NewImage[]>([]);
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  // Seeded from whether there is anything to load at all. A record being created
  // has no gallery URL yet, so it starts settled rather than being flipped out of
  // a loading state inside the effect below (which would be a cascading render).
  const [loading, setLoading] = useState(parentId !== null);
  // Bumped at the end of `persist`, which re-reads the gallery and remounts the
  // uploader. Without it the uploader would still be holding the photos it has
  // just uploaded as *pending*, and a second Save would upload every one of them
  // a second time.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (parentId === null) return;
    let cancelled = false;
    resource
      .list(parentId)
      .then((rows) => {
        if (cancelled) return;
        const images = (filter ? rows.filter(filter) : rows).map((row) => ({
          id: row.id as number,
          url: String(row.image ?? ""),
          sort_order: (row.sort_order as number) ?? 0,
        }));
        setExisting(images);
        setOrder(images.map((img) => img.id));
        setPending([]);
        setDeletedIds([]);
      })
      .catch(() => {
        /* non-critical: the form still saves, the gallery just starts empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `resource` is a module-level constant at every call site; listing it would
    // not change when it fires and only invites a re-fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, reloadToken]);

  const onChange = useCallback(
    (next: NewImage[], removed: number[], keptOrder: number[]) => {
      setPending(next);
      setDeletedIds(removed);
      setOrder(keptOrder);
    },
    [],
  );

  const persist = useCallback(
    async (id: number) => {
      // Deletes first, so a gallery already at its cap can have a photo swapped
      // in one save.
      for (const imageId of deletedIds) {
        await resource.remove(id, imageId).catch(() => null);
      }
      // New photos go on the end, then the whole surviving list is renumbered
      // from 0 - which is what makes a drag-to-reorder (and therefore the choice
      // of cover) stick.
      //
      // ⚠ A photo that has not been saved yet cannot be dragged *above* a saved
      // one: the shared `AdminImageUploader` reports its two groups separately
      // (new files, then the surviving ids in their order), so the interleaving
      // is not expressible here. Re-ordering within either group is honoured, and
      // on a record whose photos are all new - the common case, "upload the
      // outing and save" - the chosen order is exactly what is written. To make a
      // freshly added photo the cover of a record that already has some, save and
      // then drag it.
      for (let i = 0; i < pending.length; i++) {
        const image = pending[i];
        if (!image) continue;
        await resource
          .create(id, {
            image: image.base64,
            sort_order: order.length + i,
            ...createExtras,
          })
          .catch(() => null);
      }
      for (let i = 0; i < order.length; i++) {
        const imageId = order[i];
        if (imageId === undefined) continue;
        await resource.update(id, imageId, { sort_order: i }).catch(() => null);
      }
      // Re-read what the API now holds. This is what turns the photos just
      // uploaded from "pending" into saved rows with ids - see `reloadToken`.
      setReloadToken((n) => n + 1);
    },
    [resource, deletedIds, pending, order, createExtras],
  );

  return useMemo<EntityGallery>(
    () => ({ existing, loading, onChange, persist }),
    [existing, loading, onChange, persist],
  );
}

/**
 * The uploader itself, for `AdminForm`'s `imagesSlot`.
 *
 * `headerSlot` is where a record's Main Image and its separate glyph go - neither
 * belongs in the gallery. The glyph because it is a 128 px mark and the first
 * tile (the cover) would sometimes be one; the main image because it is the
 * *choice* of cover rather than another photograph, and dropping it in here
 * would put it back in the ordering it exists to override.
 *
 * ⚠ **`mainImageSet` decides whether this section may claim to hold the cover.**
 * Both the "MAIN" badge on tile 1 and the caption say "the first one is the main
 * image", which stops being true the moment a record has a main image of its
 * own - the API prefers that column and only falls back to `images[0]`
 * (`core.serializers.gallery_image_url`). Leaving them on would have the form
 * pointing at a photo the site renders nowhere.
 */
export function EntityGalleryField({
  gallery,
  headerSlot,
  maxImages = 20,
  mainImageSet = false,
}: {
  gallery: EntityGallery;
  headerSlot?: React.ReactNode;
  maxImages?: number;
  mainImageSet?: boolean;
}) {
  const t = useTranslations("Admin");

  return (
    <Box display="flex" flexDirection="column" gap={20}>
      {headerSlot}
      <Box display="flex" flexDirection="column" gap={8}>
        <Typography variant="label">{t("images")}</Typography>
        <Typography variant="caption" color="var(--muted-foreground, #6b7280)">
          {mainImageSet ? t("imagesIntroWithMain") : t("imagesIntro")}
        </Typography>
        {gallery.loading ? (
          <Typography variant="body">{t("loading")}</Typography>
        ) : (
          <AdminImageUploader
            // Remounted when the loaded rows arrive: the uploader seeds its own
            // state from `existingImages` once, on mount, so a list that lands
            // after the first render would otherwise never be shown.
            key={gallery.existing.map((img) => img.id).join("-")}
            existingImages={gallery.existing}
            onChange={gallery.onChange}
            maxImages={maxImages}
            showMainBadge={!mainImageSet}
          />
        )}
      </Box>
    </Box>
  );
}
