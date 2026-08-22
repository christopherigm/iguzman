"use client";

import { useTranslations } from "next-intl";
import { ImageGallery } from "@repo/ui/core-elements/image-gallery";

/**
 * A detail page's photographs as a mounted slideshow: one large slide with a
 * strip of thumbnails under it and a fullscreen viewer, beside the item's copy.
 * Rendered by all five detail routes - product, service, menu item, blog post
 * and highlight - so they read as one object.
 *
 * **The gallery itself is `@repo/ui`'s `ImageGallery`**, shared with
 * `apps/animals`' three catalog detail pages; what is left here is this app's
 * `Gallery` message namespace, since that package is i18n-agnostic and takes
 * every string as a prop. Two things came with the move and are deliberate:
 * fullscreen now **pages and zooms** (a second Swiper rather than a lightbox
 * over one photo, with pinch/double-tap and a magnifier for the mouse) and it
 * **locks the page behind itself**.
 *
 * `forceOrientation` is gone with it. The blog and highlight pages used to pin
 * a 5:4 frame below `md`; the frame is now always the 4:5/5:4 box derived from
 * the most-portrait photo in the set, as on every other detail page here.
 */

export interface GalleryImage {
  url: string;
  alt: string;
}

interface ItemGalleryClientProps {
  images: GalleryImage[];
  placeholderColor?: string;
  /**
   * The record's own frame, from its `aspect_ratio` column through
   * `aspectRatioValue` - null (the default) leaves the gallery deriving one
   * from the photographs, as it always has. See `lib/aspect-ratio.ts`.
   */
  aspectRatio?: number | null;
}

export function ItemGalleryClient({
  images,
  placeholderColor,
  aspectRatio,
}: ItemGalleryClientProps) {
  const t = useTranslations("Gallery");

  return (
    <ImageGallery
      images={images}
      placeholderColor={placeholderColor}
      aspectRatio={aspectRatio}
      labels={{
        expand: t("expand"),
        previous: t("previous"),
        next: t("next"),
        close: t("close"),
        zoomIn: t("zoomIn"),
        zoomOut: t("zoomOut"),
        pagination: t("paginationPhotos"),
      }}
    />
  );
}
