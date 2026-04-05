'use client';

import { useState, useEffect } from 'react';
import ReactPlayer from 'react-player';

type Props = {
  url: string;
};

/**
 * Thin 'use client' wrapper around ReactPlayer for use inside the Hero server
 * component. Renders only after mount to avoid SSR/hydration mismatches
 * (ReactPlayer relies on browser APIs and must not run on the server).
 */
export function HeroVideo({ url }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/*
       * Center the player and ensure it always covers the container.
       *   - minWidth/minHeight: 100% → always fills the hero box
       *   - aspectRatio 16/9 → expands whichever axis needs more room
       *     so the video is never letterboxed inside the hero
       */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          minWidth: '100%',
          minHeight: '100%',
          width: 'auto',
          height: 'auto',
          aspectRatio: '16 / 9',
        }}
      >
        <ReactPlayer
          url={url}
          playing
          muted
          loop
          controls={false}
          width="100%"
          height="100%"
          config={{
            youtube: {
              playerVars: {
                autoplay: 1,
                controls: 0,
                rel: 0,
                modestbranding: 1,
                playsinline: 1,
                mute: 1,
              },
            },
            vimeo: {
              playerOptions: {
                autoplay: true,
                muted: true,
                loop: true,
                background: true,
              },
            },
          }}
        />
      </div>
    </div>
  );
}
