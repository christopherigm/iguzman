'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Keyboard } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { Box } from '@repo/ui/core-elements/box';
import { Container } from '@repo/ui/core-elements/container';
import { Typography } from '@repo/ui/core-elements/typography';
import { IconButton } from '@repo/ui/core-elements/icon-button';
import { HERO_HEIGHT } from '@/lib/hero-height';
import 'swiper/css';
import './species-gallery.css';

/**
 * The landing's opening gallery: a randomized handful of featured species, one
 * full-bleed photograph per slide with its short description over the image.
 *
 * The parent picks and shuffles the species server-side (see
 * `lib/catalog.ts` → `getFeaturedSpecies`), so this component is pure
 * presentation - it never fetches, and the slides it is handed are already in
 * the order they should appear.
 */

export interface SpeciesSlide {
  id: number;
  slug: string;
  /** Already resolved for the current locale by the server component. */
  name: string;
  shortDescription: string | null;
  scientificName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  image: string;
}

interface Props {
  slides: SpeciesSlide[];
  /** Both captions link into the catalog, so the slide needs the locale prefix. */
  locale: string;
  /** Supplied by the caller - `@repo/ui` is i18n-agnostic. */
  labels: { previous: string; next: string };
}

export function SpeciesGallery({ slides, locale, labels }: Props) {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);

  if (slides.length === 0) return null;

  return (
    <Box width="100%" height={HERO_HEIGHT} styles={{ position: 'relative' }}>
      <Swiper
        className="species-gallery__swiper"
        modules={[Autoplay, Keyboard]}
        onSwiper={setSwiper}
        loop={slides.length > 1}
        slidesPerView={1}
        keyboard={{ enabled: true }}
        autoplay={slides.length > 1 ? { delay: 6000, disableOnInteraction: false } : false}
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={slide.id}>
            <Box
              width="100%"
              height="100%"
              justifyContent="flex-end"
              flexDirection="column"
              styles={{ position: 'relative', overflow: 'hidden' }}
            >
              <Image
                fill
                src={slide.image}
                alt={slide.name}
                sizes="100vw"
                // The first slide is the page's largest contentful paint.
                priority={i === 0}
                style={{ objectFit: 'cover' }}
              />

              {/* The scrim the caption sits on. A gradient is not a
                  `backgroundColor`, so it takes the `styles` escape hatch. */}
              <Box
                width="100%"
                styles={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: '65%',
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0) 100%)',
                  pointerEvents: 'none',
                }}
              />

              <Container size="lg" paddingX={10} styles={{ position: 'relative', zIndex: 1 }}>
                {/* Same inset as `DetailHero`'s caption - the band is short
                    enough now that the old 56px left the description tight
                    against the bottom edge at the clamp's floor. */}
                <Box flexDirection="column" gap={8} paddingBottom={40} maxWidth={720}>
                  {/* Both captions are links into the catalog. The slide is not
                      itself clickable: it autoplays, so a whole-slide target
                      would change destination under the pointer. */}
                  {slide.categoryName && slide.categorySlug && (
                    <Box
                      href={`/${locale}/categories/${slide.categorySlug}`}
                      prefetch
                      className="species-gallery__link"
                      alignSelf="flex-start"
                      color="inherit"
                      styles={{ textDecoration: 'none' }}
                    >
                      <Typography
                        variant="label"
                        color="#ffffff"
                        fontWeight={700}
                        styles={{ letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}
                      >
                        {slide.categoryName}
                      </Typography>
                    </Box>
                  )}

                  <Box
                    href={`/${locale}/species/${slide.slug}`}
                    prefetch
                    className="species-gallery__link"
                    alignSelf="flex-start"
                    color="inherit"
                    styles={{ textDecoration: 'none' }}
                  >
                    <Typography as="h2" variant="h1" color="#ffffff" fontWeight={700}>
                      {slide.name}
                    </Typography>
                  </Box>

                  {slide.scientificName && (
                    <Typography variant="caption" color="#ffffff" styles={{ fontStyle: 'italic', opacity: 0.85 }}>
                      {slide.scientificName}
                    </Typography>
                  )}

                  {slide.shortDescription && (
                    <Typography variant="body" color="#ffffff" styles={{ opacity: 0.92 }}>
                      {slide.shortDescription}
                    </Typography>
                  )}
                </Box>
              </Container>
            </Box>
          </SwiperSlide>
        ))}
      </Swiper>

      {slides.length > 1 && (
        <>
          <IconButton
            icon="/icons/prev.svg"
            aria-label={labels.previous}
            styles={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
            onClick={() => swiper?.slidePrev()}
            kind="success"
            translucent
          />
          <IconButton
            icon="/icons/next.svg"
            aria-label={labels.next}
            styles={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 10 }}
            onClick={() => swiper?.slideNext()}
            kind="success"
            translucent
          />
        </>
      )}
    </Box>
  );
}
