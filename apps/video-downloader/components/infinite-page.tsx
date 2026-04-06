'use client';

import { useEffect, useRef, useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Mousewheel, Virtual } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Button } from '@repo/ui/core-elements/button';
import { ProgressBar } from '@repo/ui/core-elements/progress-bar';
import { useVideoStore } from './use-video-store';
import type { StoredVideo } from './use-video-store';
import { resolveMediaUrl, PLATFORM_ICONS } from './video-item-shared';
import './infinite-page.css';

export function InfinitePage() {
  const t = useTranslations('InfinitePage');
  const { completed, removeCompleted, storeLoaded } = useVideoStore();
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
  const activeVideoElRef = useRef<HTMLVideoElement | null>(null);
  const swiperRef = useRef<SwiperType | null>(null);
  const reshuffled = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlayPrompt, setShowPlayPrompt] = useState(false);
  const [activeVideoLoading, setActiveVideoLoading] = useState(true);
  const [objectFit, setObjectFit] = useState<'cover' | 'contain'>('cover');
  const [autoSwipe, setAutoSwipe] = useState(true);
  const [deletedCountdown, setDeletedCountdown] = useState<number | null>(null);
  const [capturedFrames, setCapturedFrames] = useState<Map<string, string>>(
    new Map(),
  );

  function shuffle(list: StoredVideo[]) {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }

  useEffect(() => {
    if (!storeLoaded) return;
    const eligible = completed.filter((v) => v.downloadURL && !v.justAudio);
    setVideos(shuffle(eligible));
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoaded]); // run once when store hydrates; completed is captured at that moment for a fixed random order

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
      .catch(() => {
        if (index === 0) setShowPlayPrompt(true);
      });
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

  function captureFirstFrame(index: number) {
    const el = videoRefs.current.get(index);
    const video = videos[index];
    if (!el || !video || el.videoWidth === 0) return;
    if (capturedFrames.has(video.uuid)) return;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(el, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCapturedFrames((prev) => new Map(prev).set(video.uuid, url));
      },
      'image/jpeg',
      0.7,
    );
  }

  useEffect(() => {
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;

    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onMetadata = () =>
      setDuration(isFinite(el.duration) ? el.duration : 0);
    const onEnded = () => {
      if (autoSwipe && swiperRef.current && activeIndex < videos.length - 1) {
        swiperRef.current.slideNext();
      }
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('loadedmetadata', onMetadata);
    el.addEventListener('durationchange', onMetadata);
    el.addEventListener('ended', onEnded);

    if (isFinite(el.duration)) setDuration(el.duration);
    setCurrentTime(el.currentTime);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('loadedmetadata', onMetadata);
      el.removeEventListener('durationchange', onMetadata);
      el.removeEventListener('ended', onEnded);
    };
  }, [activeIndex, videos, autoSwipe]);

  useEffect(() => {
    if (deletedCountdown === null) return;
    if (deletedCountdown === 0) {
      setDeletedCountdown(null);
      if (swiperRef.current && activeIndex < videos.length - 1) {
        swiperRef.current.slideNext();
      }
      return;
    }
    const timer = setTimeout(
      () => setDeletedCountdown((prev) => (prev !== null ? prev - 1 : null)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [deletedCountdown, activeIndex, videos.length]);

  function handleVideoError(index: number) {
    if (index === activeIndex) setDeletedCountdown(3);
  }

  function handleVideoCanPlay(index: number) {
    if (index === activeIndex) {
      setActiveVideoLoading(false);
      captureFirstFrame(index);
    }
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = videoRefs.current.get(activeIndex);
    if (!el) return;
    const time = Number(e.target.value);
    el.currentTime = time;
    setCurrentTime(time);
  }

  function handleDelete() {
    const video = videos[activeIndex];
    if (!video) return;
    removeCompleted(video.uuid);
    setVideos((prev) => {
      const next = prev.filter((v) => v.uuid !== video.uuid);
      const newIndex = Math.min(activeIndex, next.length - 1);
      if (swiperRef.current && newIndex !== activeIndex) {
        swiperRef.current.slideTo(newIndex, 0);
      }
      setActiveIndex(newIndex);
      return next;
    });
  }

  function handleDownload() {
    const video = videos[activeIndex];
    if (!video?.downloadURL) return;
    const a = document.createElement('a');
    a.href = resolveMediaUrl(video.downloadURL);
    a.download = video.name ?? 'video';
    a.click();
  }

  function handleSwiper(swiper: SwiperType) {
    swiperRef.current = swiper;
    setActiveIndex(swiper.activeIndex);
    const el = videoRefs.current.get(swiper.activeIndex);
    setActiveVideoLoading(!el || el.readyState < 3);
    playAt(swiper.activeIndex);
  }

  function handleManualPlay() {
    setShowPlayPrompt(false);
    playAt(activeIndex);
  }

  function handleSlideChange(swiper: SwiperType) {
    pauseAt(swiper.previousIndex);
    setShowPlayPrompt(false);
    setDeletedCountdown(null);
    setActiveIndex(swiper.activeIndex);
    setCurrentTime(0);
    setDuration(0);
    const el = videoRefs.current.get(swiper.activeIndex);
    if (el) {
      // Element already in the DOM (virtual module pre-rendered it) — play directly.
      // Update the ref so the ref callback skips the duplicate play call.
      activeVideoElRef.current = el;
      setActiveVideoLoading(el.readyState < 3);
      el.currentTime = 0;
      el.play().catch(() => setShowPlayPrompt(true));
    } else {
      // Not yet rendered — ref callback will trigger play once it mounts.
      setActiveVideoLoading(true);
    }
  }

  if (!loaded || videos.length === 0) {
    return (
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        gap="8px"
        styles={{ height: '100dvh' }}
      >
        {!loaded ? (
          <Typography variant="h3">{t('loading')}</Typography>
        ) : (
          <>
            <Typography variant="h3">{t('emptyState')}</Typography>
            <Typography variant="body" color="var(--foreground-muted)">
              {t('emptyStateHint')}
            </Typography>
          </>
        )}
      </Box>
    );
  }

  return (
    <>
      <Swiper
        direction="vertical"
        modules={[Mousewheel, Virtual]}
        mousewheel
        virtual
        slidesPerView={1}
        className="infinite-swiper"
        onSwiper={handleSwiper}
        onSlideChangeTransitionStart={handleSlideChange}
      >
        {videos.map((video, index) => {
          const isActive = index === activeIndex;
          const thumbSrc =
            capturedFrames.get(video.uuid) ??
            (video.thumbnail
              ? resolveMediaUrl(`/api/media/${video.thumbnail}`)
              : null);
          return (
            <SwiperSlide
              key={video.uuid}
              virtualIndex={index}
              className="infinite-slide"
            >
              {isActive ? (
                <>
                  {thumbSrc && (
                    <Image
                      src={thumbSrc}
                      alt=""
                      fill
                      unoptimized
                      className="infinite-thumbnail"
                      style={{ objectFit }}
                    />
                  )}
                  <video
                    onClick={() => togglePlayAt(index)}
                    aria-label={video.name ?? video.originalURL}
                    ref={(el) => {
                      if (el) {
                        videoRefs.current.set(index, el);
                        if (el !== activeVideoElRef.current) {
                          activeVideoElRef.current = el;
                          el.currentTime = 0;
                          el.play().catch(() => setShowPlayPrompt(true));
                        }
                      } else {
                        videoRefs.current.delete(index);
                      }
                    }}
                    src={resolveMediaUrl(video.downloadURL!)}
                    playsInline
                    loop={!autoSwipe}
                    preload="auto"
                    className="infinite-video"
                    style={{ objectFit }}
                    onCanPlay={() => handleVideoCanPlay(index)}
                    onError={() => handleVideoError(index)}
                  />
                </>
              ) : thumbSrc ? (
                <Image
                  src={thumbSrc}
                  alt={video.name ?? ''}
                  fill
                  unoptimized
                  className="infinite-thumbnail"
                  style={{ objectFit }}
                />
              ) : (
                <Box className="infinite-thumbnail" />
              )}
            </SwiperSlide>
          );
        })}
      </Swiper>
      {activeVideoLoading && videos[activeIndex] && (
        <Box className="infinite-loading-bar">
          <ProgressBar label={t('loading')} />
        </Box>
      )}
      {deletedCountdown !== null && (
        <Box className="infinite-deleted-overlay">
          <Typography variant="h3" className="infinite-deleted-text">
            {t('videoDeletedFromServer')}
          </Typography>
          <Typography variant="body" className="infinite-deleted-countdown">
            {t('nextVideoIn', { seconds: deletedCountdown })}
          </Typography>
        </Box>
      )}
      {videos[activeIndex] && (
        <Box className="infinite-overlay">
          <Box
            display="flex"
            alignItems="flex-start"
            justifyContent="space-between"
            width="100%"
          >
            <Box className="infinite-info">
              {videos[activeIndex].name && (
                <Typography variant="body" className="infinite-title">
                  {videos[activeIndex].name}
                </Typography>
              )}
              <Typography variant="body-sm" className="infinite-count">
                {activeIndex + 1}/{videos.length}
              </Typography>
              {videos[activeIndex].uploader && (
                <Typography variant="body-sm" className="infinite-uploader">
                  {videos[activeIndex].uploader}
                </Typography>
              )}
            </Box>
            <a
              href={videos[activeIndex].originalURL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('originalLabel')}
              className="infinite-platform-link"
            >
              <Image
                src={
                  PLATFORM_ICONS[videos[activeIndex].platform] ??
                  PLATFORM_ICONS.unknown ??
                  ''
                }
                alt={videos[activeIndex].platform}
                width={32}
                height={32}
                className="infinite-platform-icon"
              />
            </a>
          </Box>
        </Box>
      )}
      {showPlayPrompt && (
        <Button
          unstyled
          onClick={handleManualPlay}
          aria-label={t('playLabel')}
          className="infinite-play-prompt"
        >
          <Image src="/icons/play.svg" alt="" width={64} height={64} />
        </Button>
      )}
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
          onClick={handleDelete}
          aria-label={t('deleteLabel')}
          className="infinite-action-btn"
        >
          <Image src="/icons/delete-video.svg" alt="" width={24} height={24} />
        </Button>
        <Button
          unstyled
          onClick={handleDownload}
          aria-label={t('downloadLabel')}
          className="infinite-action-btn"
        >
          <Image src="/icons/download.svg" alt="" width={24} height={24} />
        </Button>
        <Button
          unstyled
          onClick={() =>
            setObjectFit((prev) => (prev === 'cover' ? 'contain' : 'cover'))
          }
          aria-label={t('objectFitLabel')}
          className="infinite-action-btn"
        >
          <Image
            src={
              objectFit === 'contain'
                ? '/icons/maximize.svg'
                : '/icons/minimize.svg'
            }
            alt=""
            width={24}
            height={24}
          />
        </Button>
        <Button
          unstyled
          onClick={() => setAutoSwipe((prev) => !prev)}
          aria-label={t('autoSwipeLabel')}
          aria-pressed={autoSwipe}
          className={`infinite-action-btn${autoSwipe ? '' : ' infinite-action-btn--off'}`}
        >
          <Image src="/icons/up-arrow.svg" alt="" width={24} height={24} />
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
