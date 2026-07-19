"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import type { SuccessStory } from "@/lib/success-stories";
import { StoryCard } from "./story-card";
import "swiper/css";
import "swiper/css/pagination";

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

  return (
    <Box width="100%" styles={{ position: "relative" }}>
      <Swiper
        className="stories-swiper"
        modules={[Pagination]}
        onSwiper={setSwiper}
        slidesPerView={1}
        spaceBetween={16}
        breakpoints={{
          600: { slidesPerView: 2 }, // sm
          1200: { slidesPerView: 3 }, // lg
        }}
        pagination={{ clickable: true }}
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

      <IconButton
        icon="/icons/prev.svg"
        aria-label={t("previous")}
        styles={{
          position: "absolute",
          left: 8,
          // Offset by half of .stories-swiper's 44px pagination gutter so the
          // arrows center on the cards, not on the padded track.
          top: "calc(50% - 22px)",
          transform: "translateY(-50%)",
          zIndex: 10,
        }}
        onClick={() => swiper?.slidePrev()}
        kind="success"
        translucent
      />
      <IconButton
        icon="/icons/next.svg"
        aria-label={t("next")}
        styles={{
          position: "absolute",
          right: 8,
          // Offset by half of .stories-swiper's 44px pagination gutter so the
          // arrows center on the cards, not on the padded track.
          top: "calc(50% - 22px)",
          transform: "translateY(-50%)",
          zIndex: 10,
        }}
        onClick={() => swiper?.slideNext()}
        kind="success"
        translucent
      />
    </Box>
  );
}
