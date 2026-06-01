'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { Icon } from '@repo/ui/core-elements/icon';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import 'swiper/css';
import 'swiper/css/pagination';
import './feature-slider.css';

const LS_KEY = 'feature-slider-dismissed';

interface FeatureCard {
  key: 'offline' | 'reelMode' | 'subtitles' | 'musicPlayer' | 'videoEditor';
  src: string;
  width: number;
  height: number;
}

const CARDS: FeatureCard[] = [
  { key: 'offline', src: '/banner-offline.jpg', width: 910, height: 360 },
  { key: 'reelMode', src: '/banner-reel-mode.jpg', width: 910, height: 360 },
  { key: 'subtitles', src: '/banner-subtitles.jpg', width: 910, height: 360 },
  { key: 'musicPlayer', src: '/banner-music.jpg', width: 910, height: 360 },
  { key: 'videoEditor', src: '/banner-ffmpeg.jpg', width: 910, height: 360 },
];

export function FeatureSlider() {
  const t = useTranslations('FeatureSlider');
  const swiperRef = useRef<SwiperType | null>(null);
  const [visible, setVisible] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(LS_KEY) !== 'true') {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <>
      <Box maxWidth={400} width="100%" className="fs-wrapper">
        <Box
          elevation={2}
          borderRadius={14}
          className="vi-card"
          flexDirection="column"
          styles={{ overflow: 'hidden' }}
        >
          <Swiper
            className="fs-swiper"
            modules={[Pagination, Autoplay]}
            slidesPerView={1}
            spaceBetween={0}
            loop
            autoplay={{ delay: 15000, disableOnInteraction: false }}
            pagination={{ el: '.fs-pagination', clickable: true }}
            onSwiper={(s) => {
              swiperRef.current = s;
            }}
          >
            {CARDS.map((card) => (
              <SwiperSlide key={card.key}>
                <div className="fs-image-wrapper">
                  <Image
                    src={card.src}
                    alt={t(`${card.key}.title`)}
                    width={card.width}
                    height={card.height}
                    className="fs-image"
                  />
                  <button
                    type="button"
                    className="fs-close-btn"
                    onClick={() => setVisible(false)}
                    aria-label={t('close')}
                  >
                    <Icon icon="/icons/close.svg" size={14} color="#fff" />
                  </button>
                </div>
                <div className="fs-body">
                  <Typography variant="body-sm" fontWeight={500}>
                    {t(`${card.key}.title`)}
                  </Typography>
                  <Typography variant="body-sm">
                    {t(`${card.key}.body1`)}
                  </Typography>
                  <Typography variant="body-sm">
                    {t(`${card.key}.body2`)}
                  </Typography>
                  <Box marginTop={4}>
                    <Button
                      text={t('dontShowAgain')}
                      onClick={() => setShowConfirm(true)}
                      size="md"
                    />
                  </Box>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>

          <div className="fs-controls">
            <button
              type="button"
              className="fs-nav-btn"
              aria-label={t('prev')}
              onClick={() => swiperRef.current?.slidePrev()}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <div className="fs-pagination" />
            <button
              type="button"
              className="fs-nav-btn"
              aria-label={t('next')}
              onClick={() => swiperRef.current?.slideNext()}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              </svg>
            </button>
          </div>
        </Box>
      </Box>

      {showConfirm && (
        <ConfirmationModal
          title={t('dontShowAgainTitle')}
          text={t('dontShowAgainText')}
          okCallback={() => {
            localStorage.setItem(LS_KEY, 'true');
            setVisible(false);
            setShowConfirm(false);
          }}
          cancelCallback={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

export default FeatureSlider;
