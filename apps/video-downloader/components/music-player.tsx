'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
} from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Switch } from '@repo/ui/core-elements/switch';
import { Icon } from '@repo/ui/core-elements/icon';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { useVideoStore } from './use-video-store';
import type { StoredVideo } from './use-video-store';
import { readFromOPFS } from '@/lib/opfs';
import './music-player.css';
import { Button } from '@repo/ui/core-elements/button';
import { parseBlob } from 'music-metadata-browser';

type RepeatMode = 'none' | 'one' | 'all';

function formatTime(s: number): string {
  if (!s || isNaN(s) || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

interface PlayerButtonProps {
  icon: string;
  size?: 'sm' | 'md' | 'lg';
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  'aria-label': string;
  'aria-pressed'?: boolean;
  children?: React.ReactNode;
}

interface PlaylistButtonProps {
  isActive: boolean;
  onClick: () => void;
  'aria-label': string;
  'aria-pressed': boolean;
  children: React.ReactNode;
}

function PlaylistButton({
  isActive,
  onClick,
  children,
  ...aria
}: PlaylistButtonProps) {
  return (
    <button
      type="button"
      className={`mp-playlist-btn${isActive ? ' mp-playlist-btn--active' : ''}`}
      onClick={onClick}
      aria-label={aria['aria-label']}
      aria-pressed={aria['aria-pressed']}
    >
      {children}
    </button>
  );
}

function PlayerButton({
  icon,
  size = 'sm',
  active,
  disabled,
  onClick,
  children,
  ...aria
}: PlayerButtonProps) {
  const iconSize = size === 'lg' ? '28px' : size === 'md' ? '28px' : '22px';
  const iconColor = active
    ? 'var(--accent, #68c3f7)'
    : size === 'lg'
      ? 'var(--mp-icon-lg)'
      : size === 'md'
        ? 'var(--mp-icon-md)'
        : 'var(--mp-icon-sm)';

  return (
    <button
      type="button"
      className={`mp-btn mp-btn--${size}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={aria['aria-label']}
      {...(aria['aria-pressed'] !== undefined
        ? { 'aria-pressed': aria['aria-pressed'] }
        : {})}
    >
      <Icon icon={icon} size={iconSize} color={iconColor} />
      {children}
    </button>
  );
}

function TrackThumbnail({ track }: { track: StoredVideo }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!track.opfsThumbnailKey) return;
    let objUrl: string | null = null;
    let cancelled = false;

    readFromOPFS(track.opfsThumbnailKey)
      .then((file) => {
        if (cancelled) return;
        objUrl = URL.createObjectURL(file);
        setUrl(objUrl);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [track.uuid, track.opfsThumbnailKey]);

  return (
    <Box
      width={46}
      height={46}
      borderRadius={8}
      backgroundColor="var(--mp-surface)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      styles={{ position: 'relative', overflow: 'hidden', flexShrink: 0 }}
    >
      {url ? (
        <Image
          src={url}
          alt=""
          fill
          sizes="46px"
          style={{ objectFit: 'cover' }}
          unoptimized
        />
      ) : (
        <Icon
          icon="/icons/music.svg"
          size="20px"
          color="var(--mp-icon-placeholder)"
        />
      )}
    </Box>
  );
}

export function MusicPlayer() {
  const t = useTranslations('MusicPlayer');
  const { completed, storeLoaded } = useVideoStore();

  const [includeVideos, setIncludeVideos] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('none');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileArtist, setFileArtist] = useState<string | null>(null);
  const [fileTitle, setFileTitle] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const trackObjUrlRef = useRef<string | null>(null);
  const thumbObjUrlRef = useRef<string | null>(null);
  const shouldPlayRef = useRef(false);
  const handlePrevRef = useRef<() => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const coverRef = useRef<HTMLDivElement>(null);

  const playlist = useMemo(
    () =>
      completed.filter((v) => {
        if (!v.opfsStored || !v.opfsKey) return false;
        return includeVideos || v.justAudio;
      }),
    [completed, includeVideos],
  );

  const currentTrack = playlist[currentIndex] ?? null;

  /* Clamp index when playlist shrinks */
  useEffect(() => {
    if (playlist.length > 0 && currentIndex >= playlist.length) {
      setCurrentIndex(playlist.length - 1);
    }
  }, [playlist.length, currentIndex]);

  const getNextIndex = useCallback(
    (current: number): number => {
      if (playlist.length <= 1) return current;
      if (shuffle) {
        let next: number;
        do {
          next = Math.floor(Math.random() * playlist.length);
        } while (next === current);
        return next;
      }
      return (current + 1) % playlist.length;
    },
    [playlist.length, shuffle],
  );

  const getPrevIndex = useCallback(
    (current: number): number => {
      if (playlist.length <= 1) return current;
      return (current - 1 + playlist.length) % playlist.length;
    },
    [playlist.length],
  );

  const playTrack = useCallback((index: number) => {
    shouldPlayRef.current = true;
    setCurrentIndex(index);
  }, []);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !trackUrl) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [trackUrl]);

  const handlePrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    playTrack(getPrevIndex(currentIndex));
  }, [currentIndex, getPrevIndex, playTrack]);

  const handleNext = useCallback(() => {
    playTrack(getNextIndex(currentIndex));
  }, [currentIndex, getNextIndex, playTrack]);

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time;
  }, []);

  const handleEnded = useCallback(() => {
    if (repeat === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      }
      return;
    }
    if (repeat === 'all' || playlist.length > 1) {
      playTrack(getNextIndex(currentIndex));
    } else {
      setIsPlaying(false);
    }
  }, [repeat, currentIndex, getNextIndex, playTrack, playlist.length]);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'none' ? 'all' : r === 'all' ? 'one' : 'none'));
  }, []);

  /* Keep handler refs fresh so Media Session always calls the latest version */
  useEffect(() => {
    handlePrevRef.current = handlePrev;
  }, [handlePrev]);
  useEffect(() => {
    handleNextRef.current = handleNext;
  }, [handleNext]);

  /* Load OPFS file when the current track changes */
  useEffect(() => {
    const track = currentTrack;
    if (!track?.opfsKey) {
      setTrackUrl(null);
      setThumbnailUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const prevTrack = trackObjUrlRef.current;
    const prevThumb = thumbObjUrlRef.current;
    trackObjUrlRef.current = null;
    thumbObjUrlRef.current = null;
    if (prevTrack) URL.revokeObjectURL(prevTrack);
    if (prevThumb) URL.revokeObjectURL(prevThumb);

    setTrackUrl(null);
    setThumbnailUrl(null);
    setFileArtist(null);
    setFileTitle(null);
    setCurrentTime(0);
    setDuration(0);

    (async () => {
      try {
        const file = await readFromOPFS(track.opfsKey!);
        if (cancelled) return;
        const url = URL.createObjectURL(file);
        trackObjUrlRef.current = url;
        setTrackUrl(url);

        parseBlob(file)
          .then((meta) => {
            if (cancelled) return;
            const artist =
              meta.common.artist ?? meta.common.albumartist ?? null;
            const title = meta.common.title ?? null;
            setFileArtist(artist);
            setFileTitle(title);
          })
          .catch(() => {});
      } catch {
        if (!cancelled) setLoading(false);
        return;
      }

      if (track.opfsThumbnailKey) {
        try {
          const tf = await readFromOPFS(track.opfsThumbnailKey);
          if (!cancelled) {
            const tu = URL.createObjectURL(tf);
            thumbObjUrlRef.current = tu;
            setThumbnailUrl(tu);
          }
        } catch {
          /* thumbnail unavailable — cover art placeholder will show */
        }
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // Only reload when the actual track UUID changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.uuid]);

  /* Update audio src whenever the blob URL changes */
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!trackUrl) {
      audio.src = '';
      return;
    }
    audio.src = trackUrl;
    audio.load();
    if (shouldPlayRef.current) {
      shouldPlayRef.current = false;
      audio.play().catch(() => {});
    }
  }, [trackUrl]);

  /* Media Session — metadata */
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
    if (!currentTrack) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title:
        fileTitle ??
        currentTrack.fulltitle ??
        currentTrack.name ??
        t('unknownTitle'),
      artist: currentTrack.uploader ?? fileArtist ?? t('unknownArtist'),
      artwork: thumbnailUrl
        ? [{ src: thumbnailUrl, sizes: '512x512', type: 'image/jpeg' }]
        : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.uuid, thumbnailUrl, fileArtist, fileTitle]);

  /* Media Session — action handlers (stable, uses refs for prev/next) */
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => {
      audioRef.current?.play().catch(() => {});
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
      handlePrevRef.current();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      handleNextRef.current();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) handleSeek(details.seekTime);
    });

    return () => {
      if (!('mediaSession' in navigator)) return;
      (
        ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as const
      ).forEach((a) => {
        try {
          navigator.mediaSession.setActionHandler(a, null);
        } catch {
          /* ignore */
        }
      });
    };
  }, [handleSeek]);

  /* Media Session — playback state */
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  /* Collapse to compact header when cover art scrolls out of view */
  useEffect(() => {
    const el = coverRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => setIsCompact(!(entries[0]?.isIntersecting ?? true)),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // Re-run when playlist becomes non-empty so coverRef is populated
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.length > 0]);

  /* Revoke blob URLs on unmount */
  useEffect(() => {
    return () => {
      if (trackObjUrlRef.current) URL.revokeObjectURL(trackObjUrlRef.current);
      if (thumbObjUrlRef.current) URL.revokeObjectURL(thumbObjUrlRef.current);
    };
  }, []);

  const trackTitle =
    fileTitle ??
    currentTrack?.fulltitle ??
    currentTrack?.name ??
    t('unknownTitle');
  const trackArtist =
    currentTrack?.uploader ?? fileArtist ?? t('unknownArtist');
  const seekPct =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  /* Shared playlist rows — rendered in both the normal view and the compact overlay */
  const playlistRows = playlist.map((track, i) => {
    const isActive = i === currentIndex;
    const title = isActive
      ? trackTitle
      : (track.fulltitle ?? track.name ?? t('unknownTitle'));
    const artist = isActive
      ? trackArtist
      : (track.uploader ?? t('unknownArtist'));
    return (
      <PlaylistButton
        key={track.uuid}
        isActive={isActive}
        onClick={() => playTrack(i)}
        aria-label={`${title}${track.uploader ? ' — ' + track.uploader : ''}`}
        aria-pressed={isActive}
      >
        <TrackThumbnail track={track} />
        <Box flex="1" minWidth={0}>
          <Typography
            as="p"
            variant="none"
            color={
              isActive
                ? 'var(--accent, #68c3f7)'
                : 'var(--mp-text-strong)'
            }
            fontWeight={500}
            margin={0}
            styles={{
              fontSize: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'color 150ms',
            }}
          >
            {title}
          </Typography>
          <Typography
            as="p"
            variant="none"
            color="var(--mp-text-muted)"
            styles={{
              fontSize: 12,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              margin: '3px 0 0',
            }}
          >
            {artist}
          </Typography>
        </Box>
        {isActive && isPlaying ? (
          <Box
            className="music-player__now-playing"
            display="flex"
            alignItems="flex-end"
            gap={3}
            height={16}
            aria-hidden={true}
            styles={{ flexShrink: 0 }}
          >
            <span />
            <span />
            <span />
          </Box>
        ) : (
          <Typography
            as="span"
            variant="none"
            color="var(--mp-text-dim)"
            styles={{
              fontSize: 12,
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {track.duration ? formatTime(track.duration) : '--:--'}
          </Typography>
        )}
      </PlaylistButton>
    );
  });

  return (
    <Box
      className="music-player"
      display="flex"
      flexDirection="column"
      alignItems="center"
      paddingX={16}
      paddingTop={28}
      color="var(--mp-text)"
      styles={{
        minHeight: '100dvh',
        background: 'var(--mp-bg)',
      }}
    >
      {/* Hidden audio element — always rendered so the ref is stable */}
      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(e) =>
          setCurrentTime((e.target as HTMLAudioElement).currentTime)
        }
        onDurationChange={(e) =>
          setDuration((e.target as HTMLAudioElement).duration)
        }
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Back to home */}
      <Box alignSelf="flex-start">
        <Button
          href="/"
          // unstyled
          icon="/icons/skip-prev.svg"
          iconSize="20px"
          iconColor="var(--mp-text-label)"
          text={t('return')}
          color="var(--mp-text-label)"
          aria-label={t('return')}
          styles={{ fontSize: 14 }}
        />
      </Box>

      {!storeLoaded ? (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          flex="1"
        >
          <Spinner size={36} label={t('loading')} />
        </Box>
      ) : playlist.length === 0 ? (
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          gap={20}
          flex="1"
          paddingX={24}
          paddingY={40}
          maxWidth={360}
          styles={{ textAlign: 'center' }}
        >
          <Icon
            icon="/icons/music.svg"
            size="72px"
            color="var(--mp-icon-placeholder)"
          />
          <Typography
            variant="h4"
            color="var(--mp-text-secondary)"
            textAlign="center"
          >
            {includeVideos ? t('emptyWithVideos') : t('emptyAudioOnly')}
          </Typography>
          <Box display="flex" alignItems="center" gap={10}>
            <Switch
              checked={includeVideos}
              onChange={setIncludeVideos}
              aria-label={t('includeVideos')}
            />
            <Typography variant="body-sm" color="var(--mp-text-label)">
              {t('includeVideos')}
            </Typography>
          </Box>
        </Box>
      ) : (
        <>
          {/* Full-screen compact overlay — slides in when cover art scrolls off screen.
              Contains the mini controls at the top and the full scrollable playlist below. */}
          <div
            className={`mp-compact-header${isCompact ? ' mp-compact-header--visible' : ''}`}
          >
            <div className="mp-compact-header__inner">
              <div className="mp-compact-header__top">
                <div className="mp-compact-header__thumb">
                  {thumbnailUrl ? (
                    <Image
                      src={thumbnailUrl}
                      alt={trackTitle}
                      fill
                      sizes="46px"
                      style={{ objectFit: 'cover' }}
                      unoptimized
                    />
                  ) : (
                    <Icon
                      icon="/icons/music.svg"
                      size="52px"
                      color="var(--mp-icon-placeholder)"
                    />
                  )}
                </div>
                <div className="mp-compact-header__info">
                  <p className="mp-compact-header__title" title={trackTitle}>
                    {trackTitle}
                  </p>
                  <p className="mp-compact-header__artist">{trackArtist}</p>
                </div>
              </div>
              <input
                type="range"
                aria-label={t('seekLabel')}
                className="music-player__seek"
                min={0}
                max={duration || 1}
                value={currentTime}
                step={0.1}
                onChange={(e) => handleSeek(Number(e.target.value))}
                style={
                  {
                    background: `linear-gradient(to right, var(--mp-seek-thumb) ${seekPct}%, var(--mp-seek-track) ${seekPct}%)`,
                  } as CSSProperties
                }
              />
              <div className="mp-compact-header__timestamps">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <div className="mp-compact-header__controls">
                <PlayerButton
                  icon="/icons/random.svg"
                  size="sm"
                  active={shuffle}
                  onClick={() => setShuffle((s) => !s)}
                  aria-label={t('shuffle')}
                  aria-pressed={shuffle}
                />
                <PlayerButton
                  icon="/icons/skip-prev.svg"
                  size="md"
                  onClick={handlePrev}
                  aria-label={t('previous')}
                />
                <PlayerButton
                  icon={isPlaying ? '/icons/pause.svg' : '/icons/play.svg'}
                  size="lg"
                  disabled={!trackUrl}
                  onClick={handlePlayPause}
                  aria-label={isPlaying ? t('pause') : t('play')}
                />
                <PlayerButton
                  icon="/icons/skip-next.svg"
                  size="md"
                  onClick={handleNext}
                  aria-label={t('next')}
                />
                <PlayerButton
                  icon="/icons/repeat.svg"
                  size="sm"
                  active={repeat !== 'none'}
                  onClick={cycleRepeat}
                  aria-label={t('repeat')}
                  aria-pressed={repeat !== 'none'}
                >
                  {repeat === 'one' && (
                    <Typography
                      as="span"
                      variant="none"
                      color="var(--accent, #68c3f7)"
                      fontWeight={700}
                      styles={{
                        position: 'absolute',
                        bottom: 4,
                        right: 4,
                        fontSize: 9,
                        lineHeight: 1,
                      }}
                    >
                      1
                    </Typography>
                  )}
                </PlayerButton>
              </div>
            </div>

            {/* Playlist section inside the overlay — header pinned, items scroll */}
            <div className="mp-compact-playlist">
              <Typography
                as="div"
                variant="none"
                color="var(--mp-text-dim)"
                fontWeight={700}
                paddingTop={14}
                paddingBottom={8}
                paddingX={16}
                styles={{
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  flexShrink: 0,
                }}
              >
                {t('playlist')} · {playlist.length}
              </Typography>
              <div className="mp-compact-playlist__items">
                {playlistRows}
              </div>
            </div>
          </div>

          {/* Cover Art */}
          <div ref={coverRef} style={{ flexShrink: 0 }}>
          <Box
            className="music-player__cover-wrap"
            borderRadius={16}
            backgroundColor="var(--mp-surface)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            styles={{
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 24px 64px rgba(0,0,0,0.65)',
              flexShrink: 0,
            }}
          >
            {loading && (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                backgroundColor="rgba(0,0,0,0.5)"
                styles={{ position: 'absolute', inset: 0, zIndex: 1 }}
              >
                <Spinner size={32} />
              </Box>
            )}
            {thumbnailUrl && !loading ? (
              <Image
                src={thumbnailUrl}
                alt={trackTitle}
                fill
                sizes="(max-width: 600px) 240px, 300px"
                style={{ objectFit: 'contain' }}
                unoptimized
              />
            ) : !loading ? (
              <Box
                display="flex"
                alignItems="center"
                justifyContent="center"
                width="100%"
                height="100%"
              >
                <Icon
                  icon="/icons/music.svg"
                  size="80px"
                  color="var(--mp-icon-placeholder)"
                />
              </Box>
            ) : null}
          </Box>
          </div>

          {/* Track metadata */}
          <Box
            marginTop={24}
            width="100%"
            maxWidth={320}
            paddingX={8}
            styles={{ textAlign: 'center' }}
          >
            <Typography
              as="p"
              variant="none"
              title={trackTitle}
              styles={{
                fontSize: 20,
                fontWeight: 700,
                color: 'var(--mp-text)',
                marginBottom: 5,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {trackTitle}
            </Typography>
            <Typography
              as="p"
              variant="none"
              styles={{ fontSize: 14, color: 'var(--mp-text-secondary)' }}
            >
              {trackArtist}
            </Typography>
          </Box>

          {/* Seek bar */}
          <Box width="100%" maxWidth={360} marginTop={22} paddingX={4}>
            <input
              type="range"
              aria-label={t('seekLabel')}
              className="music-player__seek"
              min={0}
              max={duration || 1}
              value={currentTime}
              step={0.1}
              onChange={(e) => handleSeek(Number(e.target.value))}
              style={
                {
                  background: `linear-gradient(to right, var(--mp-seek-thumb) ${seekPct}%, var(--mp-seek-track) ${seekPct}%)`,
                } as CSSProperties
              }
            />
            <Box
              display="flex"
              justifyContent="space-between"
              marginTop={6}
              color="var(--mp-text-muted)"
              styles={{ fontSize: 12, fontVariantNumeric: 'tabular-nums' }}
            >
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </Box>
          </Box>

          {/* Playback controls */}
          <Box
            className="music-player__controls"
            display="flex"
            alignItems="center"
            justifyContent="center"
            gap={20}
            marginTop={24}
            width="100%"
            maxWidth={360}
          >
            <PlayerButton
              icon="/icons/random.svg"
              size="sm"
              active={shuffle}
              onClick={() => setShuffle((s) => !s)}
              aria-label={t('shuffle')}
              aria-pressed={shuffle}
            />

            <PlayerButton
              icon="/icons/skip-prev.svg"
              size="md"
              onClick={handlePrev}
              aria-label={t('previous')}
            />

            <PlayerButton
              icon={isPlaying ? '/icons/pause.svg' : '/icons/play.svg'}
              size="lg"
              disabled={!trackUrl}
              onClick={handlePlayPause}
              aria-label={isPlaying ? t('pause') : t('play')}
            />

            <PlayerButton
              icon="/icons/skip-next.svg"
              size="md"
              onClick={handleNext}
              aria-label={t('next')}
            />

            <PlayerButton
              icon="/icons/repeat.svg"
              size="sm"
              active={repeat !== 'none'}
              onClick={cycleRepeat}
              aria-label={t('repeat')}
              aria-pressed={repeat !== 'none'}
            >
              {repeat === 'one' && (
                <Typography
                  as="span"
                  variant="none"
                  color="var(--accent, #68c3f7)"
                  fontWeight={700}
                  styles={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    fontSize: 9,
                    lineHeight: 1,
                  }}
                >
                  1
                </Typography>
              )}
            </PlayerButton>
          </Box>

          {/* Include Videos toggle */}
          <Box display="flex" alignItems="center" gap={10} marginTop={28}>
            <Switch
              checked={includeVideos}
              onChange={setIncludeVideos}
              aria-label={t('includeVideos')}
            />
            <Typography variant="body-sm" color="var(--mp-text-label)">
              {t('includeVideos')}
            </Typography>
          </Box>

          {/* Playlist */}
          <Box
            marginTop={28}
            width="100%"
            maxWidth={540}
            styles={{ borderTop: '1px solid var(--mp-border)' }}
          >
            <Typography
              as="div"
              variant="none"
              color="var(--mp-text-dim)"
              fontWeight={700}
              paddingTop={14}
              paddingBottom={8}
              paddingX={16}
              styles={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {t('playlist')} · {playlist.length}
            </Typography>
            {playlistRows}
          </Box>

          <Box height={80} />
        </>
      )}
    </Box>
  );
}
