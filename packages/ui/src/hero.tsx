import React, { CSSProperties } from 'react';
import { HeroVideo } from './hero-video';

export type HeroProps = {
  /** YouTube, Vimeo, or direct video file URL. Takes priority over backgroundImage. */
  videoUrl?: string | null;
  /** Fallback background image URL shown when no video is provided. */
  backgroundImage?: string | null;
  /** Image rendered centred over the hero (e.g. a logo). */
  logoImage?: string | null;
  /** Alt text for the logo image. */
  logoAlt?: string;
  /** Alt text for the background image. */
  backgroundAlt?: string;
  /** Additional styles applied to the outermost container. */
  style?: CSSProperties;
  className?: string;
};

/**
 * Hero — full-width hero section with a background video or image, a
 * bottom-to-mid gradient overlay, and a centred logo.
 *
 * This component is a server component. The video playback is delegated to
 * `HeroVideo` ('use client') so only that subtree is hydrated on the client.
 *
 * Priority: videoUrl → backgroundImage
 *
 * @example
 * <Hero
 *   videoUrl={system.video_link}
 *   backgroundImage={system.img_hero}
 *   logoImage={system.img_logo_hero}
 *   logoAlt={system.site_name}
 * />
 */
export function Hero({
  videoUrl,
  backgroundImage,
  logoImage,
  logoAlt = '',
  backgroundAlt = '',
  style,
  className,
}: HeroProps) {
  const hasVideo = Boolean(videoUrl);
  const hasBackground = hasVideo || Boolean(backgroundImage);

  if (!hasBackground && !logoImage) return null;

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        /*
         * clamp(350px, 45vw, 600px):
         *   350 px on mobile, scales up to 600 px at ~1333 px viewport width.
         */
        height: 'clamp(350px, 45vw, 600px)',
        overflow: 'hidden',
        backgroundColor: '#000',
        ...style,
      }}
    >
      {/* ── Background layer ─────────────────────────────────── */}
      {hasVideo && videoUrl && <HeroVideo url={videoUrl} />}

      {!hasVideo && backgroundImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={backgroundImage}
          alt={backgroundAlt}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* ── Gradient overlay (bottom → mid) ──────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 55%)',
          zIndex: 1,
        }}
      />

      {/* ── Centred logo ─────────────────────────────────────── */}
      {logoImage && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoImage}
            alt={logoAlt}
            style={{
              maxWidth: 'min(320px, 50%)',
              maxHeight: '45%',
              objectFit: 'contain',
            }}
          />
        </div>
      )}
    </div>
  );
}

export default Hero;
