"use client";

import { useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Keyboard } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { SliderControls } from "@repo/ui/core-elements/slider-dots";
import { HERO_HEIGHT } from "@/lib/hero-height";
import "swiper/css";
import "./species-gallery.css";

/**
 * The landing's opening gallery: a randomized handful of featured species, one
 * full-bleed photograph per slide, captioned with the category, the name and the
 * scientific name. The species' **short description is deliberately not shown** -
 * this band is an invitation into the catalog rather than a summary of it, and a
 * paragraph of prose over a photograph that changes every six seconds is not
 * read; the description belongs on the species' own page.
 *
 * The parent picks and shuffles the species server-side (see
 * `lib/catalog.ts` → `getFeaturedSpecies`), so this component is pure
 * presentation - it never fetches, and the slides it is handed are already in
 * the order they should appear.
 *
 * All three controls sit in **one row over the bottom of the photograph** - the
 * arrows flanking a row of dots - rather than as two arrows floating at the
 * slide's mid-height: the same `SliderControls` row the journal slider uses
 * (`components/journal/latest-sightings.tsx`), so the landing pages through its
 * two sliders identically. It is positioned against the gallery's own box, not
 * inside a `SwiperSlide`, or it would be duplicated per slide and would slide
 * away with the photograph it belongs to.
 */

export interface SpeciesSlide {
  id: number;
  slug: string;
  /** Already resolved for the current locale by the server component. */
  name: string;
  scientificName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  image: string;
}

interface Props {
  slides: SpeciesSlide[];
  /** Supplied by the caller - `@repo/ui` is i18n-agnostic. */
  labels: { previous: string; next: string; pagination: string };
}

export function SpeciesGallery({ slides, labels }: Props) {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  // `realIndex`, not `activeIndex`: with `loop` on, Swiper prepends duplicate
  // slides, so only the former indexes back into `slides`.
  const [activeIndex, setActiveIndex] = useState(0);

  if (slides.length === 0) return null;

  return (
    <Box width="100%" height={HERO_HEIGHT} styles={{ position: "relative" }}>
      <Swiper
        className="species-gallery__swiper"
        modules={[Autoplay, Keyboard]}
        onSwiper={setSwiper}
        onSlideChange={(s) => setActiveIndex(s.realIndex)}
        loop={slides.length > 1}
        slidesPerView={1}
        keyboard={{ enabled: true }}
        autoplay={
          slides.length > 1
            ? { delay: 6000, disableOnInteraction: false }
            : false
        }
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={slide.id}>
            <Box
              width="100%"
              height="100%"
              justifyContent="flex-end"
              flexDirection="column"
              styles={{ position: "relative", overflow: "hidden" }}
            >
              <Image
                fill
                src={slide.image}
                alt={slide.name}
                sizes="100vw"
                // The first slide is the page's largest contentful paint.
                priority={i === 0}
                style={{ objectFit: "cover" }}
              />

              {/* The scrim the caption sits on. A gradient is not a
                  `backgroundColor`, so it takes the `styles` escape hatch. */}
              <Box
                width="100%"
                styles={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: "65%",
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0) 100%)",
                  pointerEvents: "none",
                }}
              />

              <Container
                size="lg"
                paddingX={10}
                styles={{ position: "relative", zIndex: 1 }}
              >
                {/* The control row is parked over the bottom of the same
                    photograph, so the caption's own inset has to clear it -
                    ~56px of row plus a gap - rather than `DetailHero`'s 40. */}
                <Box
                  flexDirection="column"
                  gap={8}
                  paddingBottom={slides.length > 1 ? 76 : 40}
                  maxWidth={720}
                >
                  {/* Both captions are links into the catalog. The slide is not
                      itself clickable: it autoplays, so a whole-slide target
                      would change destination under the pointer. */}
                  {slide.categoryName && slide.categorySlug && (
                    <Box
                      href={`/categories/${slide.categorySlug}`}
                      prefetch
                      className="species-gallery__link"
                      alignSelf="flex-start"
                      color="inherit"
                      styles={{ textDecoration: "none" }}
                    >
                      <Typography
                        variant="label"
                        color="#ffffff"
                        fontWeight={700}
                        styles={{
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          opacity: 0.85,
                        }}
                      >
                        {slide.categoryName}
                      </Typography>
                    </Box>
                  )}

                  <Box
                    href={`/species/${slide.slug}`}
                    prefetch
                    className="species-gallery__link"
                    alignSelf="flex-start"
                    color="inherit"
                    styles={{ textDecoration: "none" }}
                  >
                    <Typography
                      as="h2"
                      variant="h1"
                      color="#ffffff"
                      fontWeight={700}
                    >
                      {slide.name}
                    </Typography>
                  </Box>

                  {slide.scientificName && (
                    <Typography
                      variant="caption"
                      color="#ffffff"
                      styles={{ fontStyle: "italic", opacity: 0.85 }}
                    >
                      {slide.scientificName}
                    </Typography>
                  )}
                </Box>
              </Container>
            </Box>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Over the photograph's bottom edge, above the caption's scrim. It sits
          on the gallery box rather than in a slide, so it stays put while the
          photographs move under it; `SliderControls` renders nothing for a
          single slide, which is what the caption's inset also keys off. */}
      <SliderControls
        count={slides.length}
        active={activeIndex}
        // `slideToLoop` indexes the real slides; it falls through to `slideTo`
        // when the slider is not looping.
        onSelect={(i) => swiper?.slideToLoop(i)}
        onPrev={() => swiper?.slidePrev()}
        onNext={() => swiper?.slideNext()}
        label={labels.pagination}
        // Each species' own name is a better destination than "slide 3", and it
        // is already resolved for the locale.
        dotLabel={(i) => slides[i]!.name}
        previousLabel={labels.previous}
        nextLabel={labels.next}
        styles={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 20,
          zIndex: 10,
        }}
      />
    </Box>
  );
}
