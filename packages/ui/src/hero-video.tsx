"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { useHeroRevealSignal } from "./hero-reveal";

/**
 * How far before the end a looping YouTube video is sent back to the start.
 *
 * `youtube-video-element` implements `loop` by *waiting for the video to end*
 * and calling `play()` again - and YouTube paints its end screen (the big
 * pause/replay disc over a grid of "More videos" thumbnails) the instant the
 * player reaches `ENDED`, which is then still on screen for a second or two
 * after playback has restarted. No player parameter suppresses it:
 * `rel: 0` only limits the suggestions to the same channel, and
 * `iv_load_policy: 3` covers annotations/cards, not the end screen. The only
 * way a background hero never shows it is never to reach the ended state.
 *
 * 0.5s, because `timeupdate` arrives roughly every 100-250ms - a tighter lead
 * can be stepped over by one slow tick, which is exactly the flash this exists
 * to remove. The cost is the last half second of the clip on each loop, which
 * a hero background does not miss.
 */
const YOUTUBE_LOOP_LEAD_SECONDS = 0.5;

/** Whether a src is a YouTube watch/short/embed URL. */
const isYouTube = (url: string) => /(?:youtube\.com|youtu\.be)/i.test(url);

type Props = {
  url: string;
  /** Play/pause playback. Set false to hold a background hero while another player has the user's attention. */
  playing?: boolean;
  /** Show the player's native controls. Enabling this also makes the player interactive. */
  controls?: boolean;
  /** Mute playback. Browsers only autoplay muted video, so unmute only where the user opted in. */
  muted?: boolean;
  /**
   * Loop playback. On YouTube the clip is restarted `YOUTUBE_LOOP_LEAD_SECONDS`
   * before its end rather than on `ended`, so the player never paints its end
   * screen over the hero - see that constant.
   */
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
 *
 * Inside a `HeroReveal` it also reports the moment playback genuinely starts, so
 * the hero can stay closed until then rather than flickering through the
 * provider's poster frame and chrome. Outside one the signal is `null` and this
 * behaves exactly as it always did.
 *
 * A looping YouTube hero is also restarted just short of its end, so the loop
 * costs nothing on screen - see `YOUTUBE_LOOP_LEAD_SECONDS`.
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
  // `null` unless a `HeroReveal` is waiting on this player.
  const signalPlaying = useHeroRevealSignal();
  const playerRef = useRef<HTMLVideoElement>(null);
  // Set while a pre-end restart has been asked for and the seek has not landed
  // yet, so the burst of `timeupdate`s at the end of a clip fires one seek and
  // not five. Cleared as soon as playback is genuinely back before the lead.
  const restartingRef = useRef(false);

  // Only YouTube shows an end screen, and only a looping hero ever reaches the
  // end - anything else (an mp4, Vimeo's background mode) loops seamlessly on
  // its own and must keep every frame of the clip.
  const preemptEnd = loop && isYouTube(url);

  const handleTimeUpdate = useCallback(() => {
    if (!preemptEnd) return;
    const player = playerRef.current;
    if (!player) return;
    const { currentTime, duration } = player;
    // `duration` is NaN until the provider's API answers.
    if (!Number.isFinite(duration) || duration <= 0) return;
    const remaining = duration - currentTime;
    if (restartingRef.current) {
      if (remaining > YOUTUBE_LOOP_LEAD_SECONDS) restartingRef.current = false;
      return;
    }
    if (remaining <= YOUTUBE_LOOP_LEAD_SECONDS) {
      restartingRef.current = true;
      // Seeking a *playing* player leaves it playing, so this is the loop -
      // the element's own `ended` handler stays as the fallback for a clip
      // whose last `timeupdate` never arrives.
      player.currentTime = 0;
    }
  }, [preemptEnd]);

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
         * provider-specific options remain in `config`: the YouTube player
         * parameters and Vimeo's background mode.
         *
         * The YouTube block is spread LAST into the embed URL that
         * `youtube-video-element` builds, so every key here overrides that
         * element's own default. Two of its defaults are wrong for a hero:
         * `cc_load_policy: 1` force-enables closed captions (which is why
         * caption text appeared a second or two into playback), and keyboard
         * control is left on for a video the visitor never asked to drive.
         * The rest re-state suppressions explicitly rather than inheriting
         * them, since they are the difference between a clean background and
         * YouTube's chrome, and must not silently change with the dependency.
         */}
        <ReactPlayer
          ref={playerRef}
          src={url}
          playing={playing}
          muted={muted}
          loop={loop}
          controls={controls}
          playsInline
          width="100%"
          height="100%"
          // `playing`, not `play`: the provider fires `play` when playback is
          // *requested* and may still be buffering its poster frame behind it,
          // which is the exact picture a gated hero must not open on. It fires
          // again on every loop and unpause; the signal is idempotent.
          onPlaying={signalPlaying ?? undefined}
          // A hero that cannot play its video still has a slogan and a call to
          // action, so a failed load opens it rather than hiding it for good.
          onError={signalPlaying ?? undefined}
          // The loop, for YouTube: restart just *before* the end so the player
          // never reaches `ENDED` and never paints its end screen. See
          // `YOUTUBE_LOOP_LEAD_SECONDS`.
          onTimeUpdate={preemptEnd ? handleTimeUpdate : undefined}
          config={{
            youtube: {
              cc_load_policy: 0, // never auto-show closed captions
              iv_load_policy: 3, // hide video annotations / cards
              rel: 0, // no related videos at the end
              fs: 0, // no fullscreen button
              // A background hero takes no input at all; with real controls the
              // player is interactive, so leave the keyboard to the viewer.
              disablekb: controls ? 0 : 1,
            },
            vimeo: { background: !controls },
          }}
        />
      </div>
    </div>
  );
}
