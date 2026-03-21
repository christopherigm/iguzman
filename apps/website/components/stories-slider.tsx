'use client';

import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination } from 'swiper/modules';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import type { SuccessStory } from '@/lib/success-stories';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

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
    (locale === 'en' ? story.en_name : story.name) ??
    story.name ??
    story.en_name ??
    '';
  const description =
    (locale === 'en' ? story.en_description : story.description) ??
    story.description ??
    story.en_description ??
    '';
  const date = new Date(story.created).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const hasImage = Boolean(story.image);

  const boxContent = (
    <Box
      elevation={5}
      borderRadius={12}
      padding={10}
      styles={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: story.background_color ?? '#111827',
      }}
    >
      {hasImage && (
        <Image fill className="story-card__image" src={story.image!} alt={name} />
      )}

      <Box
        className={`story-card__overlay${hasImage ? '' : ' story-card__overlay--no-image'}`}
      />

      <Box className="story-card__date">{date}</Box>

      <Box className="story-card__body card-content">
        {name && (
          <Typography
            as="h3"
            variant="none"
            color="#fff"
            className="story-card__name"
          >
            {name}
          </Typography>
        )}

        {description && (
          <Typography
            variant="none"
            color="rgba(255,255,255,0.8)"
            className="story-card__description"
          >
            {description}
          </Typography>
        )}

        {story.href && (
          <Box className="story-card__cta">
            <span className="story-card__cta-btn">{readMore} →</span>
          </Box>
        )}
      </Box>
    </Box>
  );

  if (story.href) {
    return (
      <a
        href={story.href}
        target="_blank"
        rel="noopener noreferrer"
        className="story-card zoom-on-hover"
      >
        {boxContent}
      </a>
    );
  }

  return <article className="story-card zoom-on-hover">{boxContent}</article>;
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
        600: { slidesPerView: 2 },   // sm
        1200: { slidesPerView: 3 },  // lg
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
