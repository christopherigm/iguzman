"use client";

import { useState, useEffect } from "react";
import ReactPlayer from "react-player";

type Props = {
  url: string;
  /** Play/pause playback. Set false to hold a background hero while another player has the user's attention. */
  playing?: boolean;
  /** Show the player's native controls. Enabling this also makes the player interactive. */
  controls?: boolean;
  /** Mute playback. Browsers only autoplay muted video, so unmute only where the user opted in. */
  muted?: boolean;
  /** Loop playback when the video ends. */
  loop?: boolean;
  /**
   * 'cover' crops the video to fill the container (hero backgrounds);
   * 'contain' letterboxes it so the whole frame is visible (fullscreen viewing).
   */
  fit?: "cover" | "contain";
};

/**
 * Thin 'use client' wrapper around ReactPlayer for use inside the Hero server
 * component. Renders only after mount to avoid SSR/hydration mismatches
 * (ReactPlayer relies on browser APIs and must not run on the server).
 *
 * Defaults reproduce the muted, controlless, cropped background used by `Hero`.
 */
export function HeroVideo({
  url,
  playing = true,
  controls = false,
  muted = true,
  loop = true,
  fit = "cover",
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isCover = fit === "cover";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        // A controlless background must never swallow clicks meant for the
        // elements above it; with controls the player has to be reachable.
        pointerEvents: controls ? "auto" : "none",
      }}
    >
      {/*
       * Center the player. When cropping to cover:
       *   - minWidth/minHeight: 100% → always fills the hero box
       *   - aspectRatio 16/9 → expands whichever axis needs more room
       *     so the video is never letterboxed inside the hero
       * When containing, the player simply fills the (already 16/9) box.
       */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          minWidth: isCover ? "100%" : undefined,
          minHeight: isCover ? "100%" : undefined,
          width: isCover ? "auto" : "100%",
          height: isCover ? "auto" : "100%",
          aspectRatio: isCover ? "16 / 9" : undefined,
        }}
      >
        {/*
         * react-player v3 controls autoplay/controls/mute/inline through the
         * standard media props below (no longer via per-player config). Only
         * provider-specific options remain in `config`: hide YouTube related
         * videos (rel) and enable Vimeo background mode.
         */}
        <ReactPlayer
          src={url}
          playing={playing}
          muted={muted}
          loop={loop}
          controls={controls}
          playsInline
          width="100%"
          height="100%"
          config={{
            youtube: { rel: 0 },
            vimeo: { background: !controls },
          }}
        />
      </div>
    </div>
  );
}
