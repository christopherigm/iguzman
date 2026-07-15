"use client";

import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination } from "swiper/modules";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import type { SuccessStory } from "@/lib/success-stories";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";

function StoryCard({
  story,
  locale,
  readMore,
}: {
  story: SuccessStory;
  locale: string;
  readMore: string;
}) {
  const name =
    (locale === "en" ? story.en_name : story.name) ??
    story.name ??
    story.en_name ??
    "";
  const description =
    (locale === "en" ? story.en_short_description : story.short_description) ??
    story.short_description ??
    story.en_short_description ??
    "";
  const date = new Date(story.created).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const hasImage = Boolean(story.image);

  const cardBody = (
    <>
      {hasImage && (
        <Image
          fill
          src={story.image!}
          alt={name}
          style={{ objectFit: "cover" }}
        />
      )}

      <Box
        styles={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background: hasImage
            ? "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.7) 35%, rgba(0,0,0,0) 55%)"
            : "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.35) 100%)",
        }}
      />

      <Badge
        variant="filled"
        color="rgba(0, 0, 0, 0.42)"
        textColor="rgba(255, 255, 255, 0.88)"
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          zIndex: 2,
          padding: "4px 10px",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {date}
      </Badge>

      <Box
        className="card-content"
        flexDirection="column"
        gap={6}
        styles={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 2,
        }}
      >
        {name && (
          <Typography
            as="h3"
            variant="h3"
            color="#fff"
            margin={0}
            styles={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textShadow: "0 1px 4px rgba(0, 0, 0, 0.6)",
            }}
          >
            {name}
          </Typography>
        )}

        {description && (
          <Typography
            variant="caption"
            color="rgba(255,255,255,0.8)"
            margin={0}
            styles={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textShadow: "0 1px 3px rgba(0, 0, 0, 0.5)",
            }}
          >
            {description}
          </Typography>
        )}

        {(story.slug || story.href) && (
          <Box marginTop={10} justifyContent="flex-end">
            <Badge
              variant="filled"
              color="rgba(255, 255, 255, 0.1)"
              textColor="#fff"
              style={{
                padding: "5px 13px",
                fontSize: 12,
                letterSpacing: "0.04em",
                border: "1.5px solid rgba(255, 255, 255, 0.55)",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            >
              {readMore} →
            </Badge>
          </Box>
        )}
      </Box>
    </>
  );

  // Merge the outer link/article wrapper and the inner surface into a single
  // polymorphic Card: `href` makes it a next/link anchor (internal slug or
  // external href), otherwise it renders a plain surface.
  const surfaceProps = {
    elevation: 5,
    borderRadius: 12,
    padding: 10,
    height: 400,
    backgroundColor: story.background_color ?? "#111827",
    className: "zoom-on-hover",
  } as const;

  if (story.slug) {
    return (
      <Card
        href={`/blog/${story.slug}`}
        prefetch
        {...surfaceProps}
        styles={{ position: "relative", textDecoration: "none" }}
      >
        {cardBody}
      </Card>
    );
  }

  if (story.href) {
    return (
      <Card
        href={story.href}
        target="_blank"
        {...surfaceProps}
        styles={{ position: "relative", textDecoration: "none" }}
      >
        {cardBody}
      </Card>
    );
  }

  return (
    <Card {...surfaceProps} styles={{ position: "relative" }}>
      {cardBody}
    </Card>
  );
}

export function StoriesSlider({
  stories,
  locale,
  readMore,
}: {
  stories: SuccessStory[];
  locale: string;
  readMore: string;
}) {
  return (
    <Swiper
      className="stories-swiper"
      modules={[Navigation, Pagination]}
      slidesPerView={1}
      spaceBetween={16}
      breakpoints={{
        600: { slidesPerView: 2 }, // sm
        1200: { slidesPerView: 3 }, // lg
      }}
      navigation
      pagination={{ clickable: true }}
    >
      {stories.map((story) => (
        <SwiperSlide key={story.id} className="stories-swiper__slide">
          <StoryCard story={story} locale={locale} readMore={readMore} />
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
