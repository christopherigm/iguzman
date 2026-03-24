import React, { CSSProperties } from 'react';
import { HeroVideo } from './hero-video';
import './hero.css';

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
  /** Slogan text rendered centred below the logo (or centred alone if no logo). */
  slogan?: string | null;
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
  slogan,
  style,
  className,
}: HeroProps) {
  const hasVideo = Boolean(videoUrl);
  const hasBackground = hasVideo || Boolean(backgroundImage);

  if (!hasBackground && !logoImage) return null;

  return (
    <div
      className={[!hasVideo ? 'hero--image' : '', className].filter(Boolean).join(' ')}
      style={{
        position: 'relative',
        width: '100%',
        height: hasVideo ? 'clamp(350px, 45vw, 600px)' : 'clamp(500px, 65vw, 800px)',
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

      {/* ── Centred logo + slogan ─────────────────────────────── */}
      {(logoImage || slogan) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            zIndex: 2,
          }}
        >
          {logoImage && (
            <>
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
            </>
          )}
          {slogan && (
            <p
              style={{
                margin: 0,
                color: '#fff',
                textAlign: 'center',
                fontSize: 'clamp(1.25rem, 3vw, 2rem)',
                fontWeight: 600,
                letterSpacing: '0.04em',
                textShadow: '0 2px 8px rgba(0,0,0,0.7)',
              }}
            >
              {slogan}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default Hero;
