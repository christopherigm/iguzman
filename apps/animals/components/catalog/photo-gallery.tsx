'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { IconButton } from '@repo/ui/core-elements/icon-button';
import { BREAKPOINTS } from '@repo/ui/core-elements/breakpoints';
import type { ImageFit } from '@/lib/catalog';
import 'swiper/css';
import './photo-gallery.css';

/**
 * A horizontal strip of photographs, several visible at a time.
 *
 * Shared by the category and species detail pages, which fill it from different
 * sources but want the same object: on a **category** it is every photo of
 * every species filed under it (each species' cover shot plus its reference
 * photos), on a **species** it is that species' own reference photos.
 *
 * Pure presentation - the caller does the gathering, the locale resolution and
 * the ordering server-side, so this component never fetches and never calls
 * `localized()`.
 *
 * **Multi-up rather than one-slide-at-a-time**, unlike the landing's
 * `SpeciesGallery`: that one is the page's hero and a slide is the whole
 * viewport, this one is a *contact sheet* halfway down a page. Showing the
 * neighbouring photos is what tells a reader there are more of them - a
 * full-width slide here would read as a second hero and hide the count.
 */

export interface GalleryPhoto {
  /**
   * Stable across renders and unique within the strip. The caller prefixes by
   * source (`species-12`, `image-45`), since a species' cover photo and one of
   * its reference photos can otherwise collide on a bare numeric id.
   */
  key: string;
  image: string;
  /** Already resolved for the current locale by the server component. */
  title: string | null;
  caption: string | null;
  /** The record's own `fit`; `backgroundColor` is what shows around it. */
  fit: ImageFit;
  backgroundColor: string | null;
  /** Where the photo's subject lives, when it has a page of its own. */
  href: string | null;
}

interface Props {
  photos: GalleryPhoto[];
  /** Supplied by the caller - `@repo/ui` is i18n-agnostic. */
  labels: { previous: string; next: string };
}

/**
 * How many photos are in view per band. Fractional on purpose: the clipped
 * next slide is the affordance that says the strip scrolls, which is otherwise
 * invisible until someone drags it.
 */
const SLIDES_PER_VIEW = {
  [BREAKPOINTS.xs]: { slidesPerView: 1.15 },
  [BREAKPOINTS.sm]: { slidesPerView: 2.2 },
  [BREAKPOINTS.md]: { slidesPerView: 3.2 },
} as const;

export function PhotoGallery({ photos, labels }: Props) {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);

  if (photos.length === 0) return null;

  // Looping a strip with fewer photos than slots leaves Swiper duplicating them
  // to fill the row, so the same picture appears twice side by side.
  const canScroll = photos.length > 3;

  return (
    <Box width="100%" styles={{ position: 'relative' }}>
      <Swiper
        className="photo-gallery__swiper"
        modules={[Keyboard]}
        onSwiper={setSwiper}
        loop={canScroll}
        spaceBetween={16}
        breakpoints={SLIDES_PER_VIEW}
        keyboard={{ enabled: true }}
      >
        {photos.map((photo) => (
          <SwiperSlide key={photo.key}>
            <GalleryTile photo={photo} />
          </SwiperSlide>
        ))}
      </Swiper>

      {canScroll && (
        <>
          <IconButton
            icon="/icons/prev.svg"
            aria-label={labels.previous}
            styles={{
              position: 'absolute',
              left: -4,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
            }}
            onClick={() => swiper?.slidePrev()}
            kind="success"
            translucent
          />
          <IconButton
            icon="/icons/next.svg"
            aria-label={labels.next}
            styles={{
              position: 'absolute',
              right: -4,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
            }}
            onClick={() => swiper?.slideNext()}
            kind="success"
            translucent
          />
        </>
      )}
    </Box>
  );
}

function GalleryTile({ photo }: { photo: GalleryPhoto }) {
  const frame = (
    <Box
      className="photo-gallery__frame"
      width="100%"
      borderRadius={12}
      border="1px solid var(--border)"
      backgroundColor={photo.backgroundColor ?? 'var(--surface-1, #e5e7eb)'}
      styles={{ position: 'relative', overflow: 'hidden', aspectRatio: '4 / 3' }}
    >
      <Image
        fill
        src={photo.image}
        alt={photo.title ?? ''}
        // Matches SLIDES_PER_VIEW: roughly a third of the container from `md`,
        // half from `sm`, the whole width below that.
        sizes="(min-width: 900px) 33vw, (min-width: 600px) 50vw, 100vw"
        className="photo-gallery__image"
        style={{ objectFit: photo.fit }}
      />
    </Box>
  );

  return (
    <Box flexDirection="column" gap={8} width="100%" paddingBottom={4}>
      {/* The whole frame is the link when the subject has a page; the caption
          stays outside it so a long caption never becomes a huge hit area. */}
      {photo.href ? (
        <Box
          href={photo.href}
          prefetch
          className="photo-gallery__link"
          width="100%"
          borderRadius={12}
          color="inherit"
          styles={{ textDecoration: 'none' }}
        >
          {frame}
        </Box>
      ) : (
        frame
      )}

      {(photo.title || photo.caption) && (
        <Box flexDirection="column" gap={2}>
          {photo.title && (
            <Typography variant="body" fontWeight={600}>
              {photo.title}
            </Typography>
          )}
          {photo.caption && (
            <Typography
              variant="caption"
              color="var(--foreground-muted, #6b7280)"
              styles={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {photo.caption}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
