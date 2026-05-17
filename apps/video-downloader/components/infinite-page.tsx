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
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { useVideoStore } from './use-video-store';
import type { StoredVideo } from './use-video-store';
import { resolveMediaUrl, PLATFORM_ICONS } from './video-item-shared';
import { OPFSUrlProvider, useOPFSUrls } from './opfs-url-context';
import {
  isOPFSSupported,
  writeToOPFS,
  readFromOPFS,
  deleteFromOPFS,
} from '@/lib/opfs';
import './infinite-page.css';

function InfinitePageInner() {
  const t = useTranslations('InfinitePage');
  const { completed, removeCompleted, updateCompleted, storeLoaded } =
    useVideoStore();
  const { getUrls, registerUrls, revokeUrls } = useOPFSUrls();

  /* ── OPFS recovery: re-establish blob URLs on mount ── */
  useEffect(() => {
    if (!storeLoaded) return;
    void (async () => {
      /* ── Remove dead server-only videos whose file has already been deleted ── */
      for (const video of completed) {
        if (!video.opfsEnabled && video.serverFileDeleted) {
          if (video.taskId) {
            await fetch(`/api/download-video/${video.taskId}`, {
              method: 'DELETE',
            }).catch(() => {});
          }
          removeCompleted(video.uuid);
        }
      }

      if (!isOPFSSupported()) return;
      const opfsVideos = completed.filter((v) => v.opfsEnabled);
      for (const video of opfsVideos) {
        if (video.opfsStored && video.opfsKey) {
          try {
            const videoFile = await readFromOPFS(video.opfsKey);
            const videoUrl = URL.createObjectURL(videoFile);
            let thumbnailUrl: string | null = null;
            if (video.opfsThumbnailKey) {
              try {
                const thumbFile = await readFromOPFS(video.opfsThumbnailKey);
                thumbnailUrl = URL.createObjectURL(thumbFile);
              } catch {}
            }
            registerUrls(video.uuid, { videoUrl, thumbnailUrl });
            if (!video.serverFileDeleted && video.taskId) {
              await fetch(`/api/download-video/${video.taskId}`, {
                method: 'DELETE',
              }).catch(() => {});
              updateCompleted(video.uuid, { serverFileDeleted: true });
            }
          } catch {
            /* OPFS file evicted by browser — server already deleted, remove from store */
            removeCompleted(video.uuid);
          }
        } else if (
          !video.opfsStored &&
          !video.serverFileDeleted &&
          video.file &&
          video.taskId
        ) {
          try {
            const videoRes = await fetch(`/api/media/${video.file}`);
            if (!videoRes.ok) throw new Error('not found');
            const videoBlob = await videoRes.blob();
            await writeToOPFS(video.file, videoBlob);
            let thumbKey: string | null = null;
            if (video.thumbnail) {
              try {
                const thumbRes = await fetch(`/api/media/${video.thumbnail}`);
                if (thumbRes.ok) {
                  const thumbBlob = await thumbRes.blob();
                  thumbKey = `thumb_${video.thumbnail}`;
                  await writeToOPFS(thumbKey, thumbBlob);
                }
              } catch {}
            }

            let captionsKey: string | null = null;
            if (video.captionsFile) {
              try {
                const captionsRes = await fetch(video.captionsFile);
                if (captionsRes.ok) {
                  const captionsBlob = await captionsRes.blob();
                  const captionsFilename = video.captionsFile.split('/').pop()!;
                  captionsKey = `captions_${captionsFilename}`;
                  await writeToOPFS(captionsKey, captionsBlob);
                }
              } catch {}
            }

            await fetch(`/api/download-video/${video.taskId}`, {
              method: 'DELETE',
            }).catch(() => {});
            const videoFile = await readFromOPFS(video.file);
            const videoUrl = URL.createObjectURL(videoFile);
            let thumbnailUrl: string | null = null;
            if (thumbKey) {
              try {
                const thumbFile = await readFromOPFS(thumbKey);
                thumbnailUrl = URL.createObjectURL(thumbFile);
              } catch {}
            }
            registerUrls(video.uuid, { videoUrl, thumbnailUrl });
            updateCompleted(video.uuid, {
              opfsKey: video.file,
              opfsThumbnailKey: thumbKey,
              opfsCaptionsKey: captionsKey,
              opfsStored: true,
              serverFileDeleted: true,
              downloadURL: null,
            });
          } catch {
            /* Server file not found — delete MongoDB record and remove from store */
            await fetch(`/api/download-video/${video.taskId}`, {
              method: 'DELETE',
            }).catch(() => {});
            removeCompleted(video.uuid);
          }
        } else if (!video.opfsStored && video.serverFileDeleted) {
          /* No OPFS data and server already deleted — remove from store */
          removeCompleted(video.uuid);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoaded]);
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    const eligible = completed.filter((v) => v.opfsStored && !v.justAudio);
    setVideos(shuffle(eligible));
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeLoaded]);

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

  function confirmAndDelete() {
    const video = videos[activeIndex];
    if (!video) return;
    setConfirmDelete(false);
    if (video.opfsEnabled) {
      if (video.opfsKey) void deleteFromOPFS(video.opfsKey).catch(() => {});
      if (video.opfsThumbnailKey)
        void deleteFromOPFS(video.opfsThumbnailKey).catch(() => {});
      if (video.opfsCaptionsKey)
        void deleteFromOPFS(video.opfsCaptionsKey).catch(() => {});
      revokeUrls(video.uuid);
    }
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

  function handleDelete() {
    if (!videos[activeIndex]) return;
    setConfirmDelete(true);
  }

  function handleDownload() {
    const video = videos[activeIndex];
    if (!video) return;
    const opfsUrls = video.opfsEnabled ? getUrls(video.uuid) : null;
    const href =
      opfsUrls?.videoUrl ??
      (video.opfsStored
        ? null
        : video.downloadURL
          ? resolveMediaUrl(video.downloadURL)
          : null);
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
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
          const opfsUrls = video.opfsEnabled ? getUrls(video.uuid) : null;
          const thumbSrc =
            capturedFrames.get(video.uuid) ??
            opfsUrls?.thumbnailUrl ??
            (video.thumbnail && !(video.opfsEnabled && video.serverFileDeleted)
              ? resolveMediaUrl(`/api/media/${video.thumbnail}`)
              : null);
          const videoSrc =
            opfsUrls?.videoUrl ??
            (video.opfsStored
              ? null
              : video.downloadURL
                ? resolveMediaUrl(video.downloadURL)
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
                  {videoSrc ? (
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
                      src={videoSrc}
                      playsInline
                      loop={!autoSwipe}
                      preload="auto"
                      className="infinite-video"
                      style={{ objectFit }}
                      onCanPlay={() => handleVideoCanPlay(index)}
                      onError={() => handleVideoError(index)}
                    />
                  ) : null}
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
      {confirmDelete && (
        <ConfirmationModal
          title={t('confirmDeleteTitle')}
          text={t('confirmDeleteText')}
          okCallback={confirmAndDelete}
          cancelCallback={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}

export function InfinitePage() {
  return (
    <OPFSUrlProvider>
      <InfinitePageInner />
    </OPFSUrlProvider>
  );
}
