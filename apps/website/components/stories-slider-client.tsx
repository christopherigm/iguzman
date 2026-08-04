"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { SliderControls } from "@repo/ui/core-elements/slider-dots";
import type { SuccessStory } from "@/lib/success-stories";
import { StoryCard } from "./story-card";
import "swiper/css";

/**
 * The success-story slider.
 *
 * The controls are `@repo/ui`'s shared `SliderControls` row - the arrows
 * flanking accent-coloured dots, in one row **beneath** the cards. They used to
 * be Swiper's own `Pagination` bullets (which render at Swiper's stock blue,
 * not the tenant's brand colour) plus two arrows absolutely positioned over the
 * track; the row is what every slider in the monorepo now uses.
 *
 * ⚠ This one shows **several** cards at once, so the dots are driven by
 * `snapGrid` / `snapIndex`, not by the story count: with three cards on screen
 * the last snap is story 3 of 5, and a dot per story would leave two of them
 * permanently unreachable. `snapGrid` is re-read on breakpoint changes because
 * `slidesPerView` changes with it.
 */
export function StoriesSliderClient({
  stories,
  locale,
  readMore,
  isAdmin = false,
  editLabel,
}: {
  stories: SuccessStory[];
  locale: string;
  readMore: string;
  isAdmin?: boolean;
  editLabel?: string;
}) {
  const t = useTranslations("SuccessStories");
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  const [snaps, setSnaps] = useState({ count: 0, index: 0 });

  // ⚠ Read the instance here, eagerly, and let the updater close over plain
  // numbers. A functional updater that captured `s` would be replayed by React
  // on the *next* render, and by then swiper-react's effect cleanup may have run
  // `destroy(true, false)` - which deletes every own property of the instance,
  // so `s.snapGrid` reads back `undefined`.
  const syncSnaps = (s: SwiperType) => {
    const count = s.snapGrid.length;
    const index = s.snapIndex;
    setSnaps((prev) =>
      prev.count === count && prev.index === index ? prev : { count, index },
    );
  };

  return (
    <Box width="100%" flexDirection="column" gap={20}>
      <Swiper
        className="stories-swiper"
        onSwiper={(s) => {
          setSwiper(s);
          syncSnaps(s);
        }}
        onSlideChange={syncSnaps}
        onSnapGridLengthChange={syncSnaps}
        onBreakpoint={syncSnaps}
        slidesPerView={1}
        spaceBetween={16}
        breakpoints={{
          600: { slidesPerView: 2 }, // sm
          1200: { slidesPerView: 3 }, // lg
        }}
      >
        {stories.map((story) => (
          <SwiperSlide key={story.id} className="stories-swiper__slide">
            <StoryCard
              story={story}
              locale={locale}
              readMore={readMore}
              isAdmin={isAdmin}
              editLabel={editLabel}
            />
          </SwiperSlide>
        ))}
      </Swiper>

      <SliderControls
        count={snaps.count}
        active={snaps.index}
        // A snap index maps to the slide of the same index (`slidesPerGroup` is
        // 1), and `slideTo` clamps at the end of the track.
        onSelect={(i) => swiper?.slideTo(i)}
        onPrev={() => swiper?.slidePrev()}
        onNext={() => swiper?.slideNext()}
        label={t("pagination")}
        previousLabel={t("previous")}
        nextLabel={t("next")}
      />
    </Box>
  );
}
