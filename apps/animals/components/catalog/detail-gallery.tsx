"use client";

import { useTranslations } from "next-intl";
import { ImageGallery } from "@repo/ui/core-elements/image-gallery";
import type { ImageFit } from "@/lib/catalog";

/**
 * A detail page's photographs as a mounted slideshow: one large slide with a
 * strip of thumbnails under it and a fullscreen viewer, sitting beside the
 * description and the facts card in the page's first row.
 *
 * **The gallery itself is `@repo/ui`'s `ImageGallery`** - the slideshow, the
 * fullscreen Swiper, its zoom and the scroll lock all live there, shared with
 * `apps/website`'s five detail pages, so the two sites page through a record's
 * photographs identically. What is left here is this app's half of the deal:
 * the `Gallery` message namespace (the package is i18n-agnostic and takes every
 * string as a prop) and the catalog's own `ImageFit`, which is what lets a
 * plate authored as `contain` - an illustration, a range map - be letterboxed
 * over its own background instead of cropped to fill the frame.
 *
 * **All three detail routes share it** - a category, a species and a journal
 * entry each show their photographs this way, which is what makes their first
 * row one object rather than three. It replaced the multi-up contact sheet the
 * category and sighting pages used to carry below the fold.
 *
 * Not to be confused with `app/[locale]/species-gallery.tsx`, the landing page's
 * own full-bleed strip.
 */

export interface GalleryImage {
  url: string;
  alt: string;
  /** The record's own `fit`; `backgroundColor` is what shows around it. */
  fit?: ImageFit;
  backgroundColor?: string | null;
}

interface Props {
  images: GalleryImage[];
  /** Painted behind an empty gallery and behind a `contain` photo. */
  placeholderColor?: string | null;
}

export function DetailGallery({ images, placeholderColor }: Props) {
  const t = useTranslations("Gallery");

  return (
    <ImageGallery
      images={images}
      placeholderColor={placeholderColor}
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
