'use client';

import { useEffect, useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { useVideoStore } from './use-video-store';
import type { StoredVideo } from './use-video-store';
import { resolveMediaUrl, PLATFORM_ICONS } from './video-item-shared';
import './infinite-page.css';

export function InfinitePage() {
  const t = useTranslations('InfinitePage');
  const { completed } = useVideoStore();
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const swiperRef = useRef<SwiperType | null>(null);
  const reshuffled = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  function shuffle(list: StoredVideo[]) {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }

  useEffect(() => {
    const eligible = completed.filter((v) => v.downloadURL && !v.justAudio);
    setVideos(shuffle(eligible));
  }, []); // fixed random order on mount

  function handleReshuffle() {
    if (swiperRef.current) {
      pauseAt(swiperRef.current.activeIndex);
      swiperRef.current.slideTo(0, 0);
    }
    reshuffled.current = true;
    setVideos((prev) => shuffle(prev));
  }

  useEffect(() => {
    if (!reshuffled.current) return;
    reshuffled.current = false;
    const el = videoRefs.current.get(0);
    if (el) {
      el.currentTime = 0;
    }
    playAt(0);
  }, [videos]);

  function playAt(index: number) {
    videoRefs.current
      .get(index)
      ?.play()
      .catch(() => {});
  }

  function pauseAt(index: number) {
    videoRefs.current.get(index)?.pause();
  }

  function togglePlayAt(index: number) {
    const el = videoRefs.current.get(index);
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  useEffect(() => {
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;

    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onMetadata = () =>
      setDuration(isFinite(el.duration) ? el.duration : 0);

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onMetadata);
    el.addEventListener('durationchange', onMetadata);

    if (isFinite(el.duration)) setDuration(el.duration);
    setCurrentTime(el.currentTime);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onMetadata);
      el.removeEventListener('durationchange', onMetadata);
    };
  }, [activeIndex, videos]);

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;
    const time = Number(e.target.value);
    el.currentTime = time;
    setCurrentTime(time);
  }

  function handleSwiper(swiper: SwiperType) {
    swiperRef.current = swiper;
    setActiveIndex(swiper.activeIndex);
    playAt(swiper.activeIndex);
  }

  function handleSlideChange(swiper: SwiperType) {
    pauseAt(swiper.previousIndex);
    setActiveIndex(swiper.activeIndex);
    setCurrentTime(0);
    setDuration(0);
    playAt(swiper.activeIndex);
  }

  if (videos.length === 0) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="8px"
        styles={{ height: '100dvh' }}
      >
        <Typography variant="h3">{t('emptyState')}</Typography>
        <Typography variant="body" color="var(--foreground-muted)">
          {t('emptyStateHint')}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <Swiper
        direction="vertical"
        modules={[Mousewheel]}
        mousewheel
        slidesPerView={1}
        className="infinite-swiper"
        onSwiper={handleSwiper}
        onSlideChange={handleSlideChange}
      >
        {videos.map((video, index) => (
          <SwiperSlide key={video.uuid} className="infinite-slide">
            <video
              onClick={() => togglePlayAt(index)}
              aria-label={video.name ?? video.originalURL}
              ref={(el) => {
                if (el) videoRefs.current.set(index, el);
                else videoRefs.current.delete(index);
              }}
              src={resolveMediaUrl(video.downloadURL!)}
              muted
              playsInline
              loop
              className="infinite-video"
            />
            <Box className="infinite-overlay">
              <Box className="infinite-info">
                {video.name && (
                  <Typography variant="body" className="infinite-title">
                    {video.name}
                  </Typography>
                )}
                {video.uploader && (
                  <Typography variant="body-sm" className="infinite-uploader">
                    {video.uploader}
                  </Typography>
                )}
              </Box>
              <Image
                src={
                  PLATFORM_ICONS[video.platform] ?? PLATFORM_ICONS.unknown ?? ''
                }
                alt={video.platform}
                width={32}
                height={32}
                className="infinite-platform-icon"
              />
            </Box>
          </SwiperSlide>
        ))}
      </Swiper>
      {duration > 0 && (
        <Box
          className="infinite-progress-container"
          styles={
            {
              '--progress': `${(currentTime / duration) * 100}%`,
            } as React.CSSProperties
          }
        >
          <input
            type="range"
            className="infinite-progress"
            min={0}
            max={duration}
            value={currentTime}
            step={0.1}
            onChange={handleSeek}
            aria-label={t('seekLabel')}
          />
        </Box>
      )}
      <Box className="infinite-actions">
        <Button
          unstyled
          href="/"
          aria-label={t('homeLabel')}
          className="infinite-action-btn"
        >
          <Image src="/icons/home.svg" alt="" width={24} height={24} />
        </Button>
        <Button
          unstyled
          onClick={handleReshuffle}
          aria-label={t('reshuffleLabel')}
          className="infinite-action-btn"
        >
          <Image src="/icons/random.svg" alt="" width={24} height={24} />
        </Button>
      </Box>
    </>
  );
}
