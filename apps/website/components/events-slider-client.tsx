"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { SliderControls } from "@repo/ui/core-elements/slider-dots";
import type { Event } from "@/lib/events";
import { EventCard, type EventCardLabels } from "./event-card";
import "swiper/css";

/**
 * The events slider - upcoming first, then the most recent past ones.
 *
 * ⚠ Several cards are on screen at once, so the dots are driven by
 * `snapGrid` / `snapIndex`, **not** by the event count: with three cards
 * visible the last snap is event 3 of 5, and a dot per event would leave two of
 * them permanently unreachable. `snapGrid` is re-read on breakpoint changes
 * because `slidesPerView` changes with it. Same shape as
 * `stories-slider-client.tsx`; the controls are `@repo/ui`'s shared row, which
 * paints its dots from the tenant's `--accent`.
 */
export function EventsSliderClient({
  events,
  locale,
  labels,
  isAdmin = false,
  editLabel,
}: {
  events: Event[];
  locale: string;
  labels: EventCardLabels;
  isAdmin?: boolean;
  editLabel?: string;
}) {
  const t = useTranslations("Events");
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  const [snaps, setSnaps] = useState({ count: 0, index: 0 });

  // ⚠ Read the instance eagerly and let the updater close over plain numbers. A
  // functional updater capturing `s` would be replayed by React on the *next*
  // render, by which time swiper-react's cleanup may have run `destroy(true,
  // false)` - which deletes every own property, so `s.snapGrid` reads back
  // `undefined`. (The same note sits on the stories slider.)
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
        className="events-swiper"
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
        {events.map((event, i) => (
          <SwiperSlide key={event.id} className="events-swiper__slide">
            <EventCard
              event={event}
              locale={locale}
              labels={labels}
              isAdmin={isAdmin}
              editLabel={editLabel}
              priority={i === 0}
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
