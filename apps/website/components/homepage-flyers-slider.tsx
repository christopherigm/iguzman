"use client";

import { useState, type ReactNode } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Keyboard } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { SliderControls } from "@repo/ui/core-elements/slider-dots";
import { LandingSection } from "./landing-section";
import "swiper/css";
import "./homepage-flyers.css";

export interface FlyerSlide {
  id: number;
  /** Labels this slide's dot for a screen reader. Already locale-resolved. */
  title: string;
  /** The whole slide - its band, its copy and its item cards - rendered on the server. */
  content: ReactNode;
}

/**
 * The homepage flyers slider: one full-bleed band per slide, with the shared
 * control row beneath it.
 *
 * It is deliberately **only** the slider. Each slide arrives as a finished node
 * from `components/homepage-flyers.tsx`, which is where the locale, the catalog
 * and the per-viewer state of the item cards are resolved - the same server/
 * client split every other slider on this site makes, and the reason a
 * `BuyableCard` (an async server component, with a session and a cart behind it)
 * can ride inside a client-side Swiper at all.
 *
 * One slide is on screen at a time - a flyer is a full-width composition, not a
 * card in a rail - so the dots are driven by the slide count and `realIndex`
 * rather than by `snapGrid`. With a single flyer `SliderControls` renders
 * nothing, which is what leaves a lone flyer looking like a section rather than
 * a slider with one stop.
 */
export function HomepageFlyersSlider({
  slides,
  labels,
}: {
  slides: FlyerSlide[];
  labels: { previous: string; next: string; pagination: string };
}) {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  // `realIndex`, not `activeIndex`: with `loop` on, Swiper prepends duplicate
  // slides, so only the former indexes back into `slides`.
  const [activeIndex, setActiveIndex] = useState(0);

  if (slides.length === 0) return null;

  // With one flyer this block is exactly a banded section: the slide's own
  // `LandingSection` carries the rhythm, `SliderControls` draws nothing, and the
  // band meets its neighbours the way every other band does.
  //
  // With two or more, the control row is the one thing on a landing that sits
  // *outside* the section it belongs to - the padding is inside each flyer's
  // band and what ends the section is the dots below it, which left them flush
  // against whatever came next (two colour fields meeting with only the dots
  // between them, on every landing that puts the flyers above the highlights).
  // So the pair is wrapped in a section of its own that is flush at the top -
  // the band already spaced that edge - and pays the rhythm's bottom half after
  // the dots. `bare`, because the swiper is full-bleed and the control row
  // brings its own `Container`.
  const hasControls = slides.length > 1;

  return (
    <LandingSection bare flushTop flushBottom={!hasControls}>
      <Box width="100%" flexDirection="column" gap={20}>
        <Swiper
          className="homepage-flyers__swiper"
          modules={[Keyboard]}
          onSwiper={setSwiper}
          onSlideChange={(s) => setActiveIndex(s.realIndex)}
          loop={slides.length > 1}
          slidesPerView={1}
          // No gap between slides: each one is a full-bleed colour band, and a gap
          // would show a stripe of the page between two bands mid-swipe.
          spaceBetween={0}
          autoHeight
          keyboard={{ enabled: true }}
        >
          {slides.map((slide) => (
            <SwiperSlide key={slide.id}>{slide.content}</SwiperSlide>
          ))}
        </Swiper>

        {/* Inside the page container, unlike the bands above it: the arrows and
          dots belong to the page's rhythm, not to the full-width band. */}
        <Container paddingX={10}>
          <SliderControls
            count={slides.length}
            active={activeIndex}
            // `slideToLoop` indexes the real slides; it falls through to `slideTo`
            // when the slider is not looping.
            onSelect={(i) => swiper?.slideToLoop(i)}
            onPrev={() => swiper?.slidePrev()}
            onNext={() => swiper?.slideNext()}
            label={labels.pagination}
            // Each flyer's own title is a better destination than "slide 3", and
            // it is already resolved for the locale.
            dotLabel={(i) => slides[i]!.title}
            previousLabel={labels.previous}
            nextLabel={labels.next}
          />
        </Container>
      </Box>
    </LandingSection>
  );
}
