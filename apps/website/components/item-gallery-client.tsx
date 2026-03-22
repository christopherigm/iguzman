'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Thumbs, Navigation, FreeMode } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { Box } from '@repo/ui/core-elements/box';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/free-mode';
import 'swiper/css/thumbs';
import './item-gallery-client.css';

export interface GalleryImage {
  url: string;
  alt: string;
}

interface ItemGalleryClientProps {
  images: GalleryImage[];
  placeholderColor?: string;
}

export function ItemGalleryClient({
  images,
  placeholderColor,
}: ItemGalleryClientProps) {
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);

  if (images.length === 0) {
    return (
      <Box
        className="item-gallery item-gallery--placeholder"
        styles={{ backgroundColor: placeholderColor ?? 'var(--surface-1, #e0e0e0)' }}
      />
    );
  }

  return (
    <Box className="item-gallery">
      <Swiper
        modules={[Thumbs, Navigation, FreeMode]}
        thumbs={{ swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null }}
        navigation
        loop={images.length > 1}
        className="item-gallery__main"
      >
        {images.map((img, i) => (
          <SwiperSlide key={i}>
            <Box className="item-gallery__slide">
              <Image
                fill
                src={img.url}
                alt={img.alt}
                className="item-gallery__image"
                sizes="(min-width: 1200px) 40vw, (min-width: 600px) 50vw, 100vw"
                priority={i === 0}
              />
            </Box>
          </SwiperSlide>
        ))}
      </Swiper>

      {images.length > 1 && (
        <Swiper
          modules={[Thumbs, FreeMode]}
          onSwiper={setThumbsSwiper}
          slidesPerView={4}
          spaceBetween={8}
          freeMode
          watchSlidesProgress
          className="item-gallery__thumbs"
        >
          {images.map((img, i) => (
            <SwiperSlide key={i}>
              <Box className="item-gallery__thumb">
                <Image
                  fill
                  src={img.url}
                  alt={img.alt}
                  className="item-gallery__thumb-image"
                  sizes="15vw"
                />
              </Box>
            </SwiperSlide>
          ))}
        </Swiper>
      )}
    </Box>
  );
}
