import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Drives the Samsung native player (`webapis.avplay`) for a self-hosted digital
 * copy and surfaces the state a control bar needs: play/pause phase, playhead,
 * duration, and the audio/subtitle tracks with the handlers to switch them.
 *
 * AVPlay decodes onto a hardware plane *behind* the transparent webview, so the
 * caller still renders the `<object type="application/avplayer">` placeholder;
 * this hook only opens/prepares/plays and issues control commands against it.
 *
 * Playback starts only once `active` flips true (so the caller can hold on a
 * "resume or start over" prompt first), seeking to `startAt` before the first
 * play so a resumed title picks up where it left off.
 */

export type PlayerPhase = "loading" | "playing" | "paused" | "error";

/** One selectable audio or subtitle track, already labelled for display. */
export interface PlayerTrack {
  /** AVPlay's own track index, passed back to `setSelectTrack`. */
  index: number;
  label: string;
}

export interface StreamPlayer {
  phase: PlayerPhase;
  errorDetail?: string;
  /** Playhead in milliseconds. */
  currentTime: number;
  /** Total length in milliseconds (0 until known). */
  duration: number;
  audioTracks: PlayerTrack[];
  subtitleTracks: PlayerTrack[];
  /** AVPlay index of the active audio track. */
  activeAudio: number;
  /** AVPlay index of the active subtitle track, or `null` when off. */
  activeSubtitle: number | null;
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  seekBy: (deltaMs: number) => void;
  /** Seek to an absolute position (ms), clamped into the playable range. */
  seekTo: (ms: number) => void;
  selectAudio: (index: number) => void;
  selectSubtitle: (index: number | null) => void;
}

interface Options {
  url: string;
  /** Start (or keep) playback when true; hold closed when false. */
  active: boolean;
  /** Position (ms) to seek to before the first play - 0 to start from the top. */
  startAt: number;
  /** Ordered spoken-language names for labelling audio tracks (movie metadata). */
  audioLanguages: string[];
  /** Ordered subtitle-language names for labelling text tracks (movie metadata). */
  subtitleLanguages: string[];
  /** Generic per-track fallbacks, e.g. "Audio" / "Subtitle" (already localized). */
  audioFallback: string;
  subtitleFallback: string;
  onError: (detail?: string) => void;
  onEnded: () => void;
}

// ISO 639-2/1 codes AVPlay commonly reports in `extra_info`, mapped to the same
// English names the movie metadata uses so a fallback label reads consistently.
const LANG_NAMES: Record<string, string> = {
  eng: "English",
  en: "English",
  spa: "Spanish",
  es: "Spanish",
  fra: "French",
  fre: "French",
  fr: "French",
  deu: "German",
  ger: "German",
  de: "German",
  por: "Portuguese",
  pt: "Portuguese",
  ita: "Italian",
  it: "Italian",
  jpn: "Japanese",
  ja: "Japanese",
};

/** Best-effort language name from a track's `extra_info` JSON, else null. */
function parseTrackLanguage(extraInfo: string): string | null {
  try {
    const info = JSON.parse(extraInfo) as Record<string, unknown>;
    const raw = info.language ?? info.track_lang ?? info.lang;
    if (typeof raw !== "string" || !raw.trim()) return null;
    const code = raw.trim().toLowerCase();
    return LANG_NAMES[code] ?? raw.trim();
  } catch {
    return null;
  }
}

/**
 * Label a set of same-type tracks, preferring the movie's metadata language
 * list (matched by position) and falling back to the track's own `extra_info`
 * language, then to a numbered generic label.
 */
function buildTracks(
  tracks: AVPlayTrackInfo[],
  languages: string[],
  fallback: string,
): PlayerTrack[] {
  // Only trust the metadata mapping when the counts line up; a mismatch means
  // the file's track order isn't the metadata order, so derive labels instead.
  const useMetadata = languages.length === tracks.length && languages.length > 0;
  return tracks.map((track, i) => {
    const label = useMetadata
      ? (languages[i] ?? `${fallback} ${i + 1}`)
      : (parseTrackLanguage(track.extra_info) ?? `${fallback} ${i + 1}`);
    return { index: track.index, label };
  });
}

export function useStreamPlayer({
  url,
  active,
  startAt,
  audioLanguages,
  subtitleLanguages,
  audioFallback,
  subtitleFallback,
  onError,
  onEnded,
}: Options): StreamPlayer {
  const [phase, setPhase] = useState<PlayerPhase>("loading");
  const [errorDetail, setErrorDetail] = useState<string | undefined>();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioTracks, setAudioTracks] = useState<PlayerTrack[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<PlayerTrack[]>([]);
  const [activeAudio, setActiveAudio] = useState(0);
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null);

  // Latest values the open-once effect reads without re-subscribing. Written in
  // an effect (not during render) per react-hooks/refs; declared before the open
  // effect so they're current when it runs on the activating commit.
  const startAtRef = useRef(startAt);
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    startAtRef.current = startAt;
    onErrorRef.current = onError;
    onEndedRef.current = onEnded;
  });

  const fail = useCallback((detail?: string) => {
    setPhase("error");
    setErrorDetail(detail);
    onErrorRef.current(detail);
  }, []);

  // Open + prepare + play once activated; tear the player down on unmount. Kept
  // deliberately narrow in deps ([url, active]) so control commands (issued via
  // the callbacks below) never re-open the stream.
  useEffect(() => {
    if (!active) return;
    const player = window.webapis?.avplay;
    if (!player) {
      // No native player (e.g. the dev browser). Surface it as an unplayable
      // copy, deferred so it isn't a synchronous setState in the effect body.
      queueMicrotask(fail);
      return;
    }
    let live = true;
    try {
      player.open(url);
      // The TV always treats the screen as 1920x1080, regardless of app res.
      player.setDisplayRect(0, 0, 1920, 1080);
      // Letterbox non-16:9 sources instead of stretching them to fill.
      player.setDisplayMethod("PLAYER_DISPLAY_MODE_LETTER_BOX");
      player.setListener({
        oncurrentplaytime: (ms) => {
          if (live) setCurrentTime(ms);
        },
        onstreamcompleted: () => onEndedRef.current(),
        onerror: (eventType) => {
          if (live) fail(eventType);
        },
      });
      player.prepareAsync(
        () => {
          if (!live) return;
          try {
            setDuration(player.getDuration());
          } catch {
            /* duration unavailable - progress bar just shows elapsed */
          }
          // Discover selectable tracks; degrade gracefully if unsupported.
          try {
            const info = player.getTotalTrackInfo();
            setAudioTracks(
              buildTracks(
                info.filter((t) => t.type === "AUDIO"),
                audioLanguages,
                audioFallback,
              ),
            );
            setSubtitleTracks(
              buildTracks(
                info.filter((t) => t.type === "TEXT"),
                subtitleLanguages,
                subtitleFallback,
              ),
            );
          } catch {
            /* track info unavailable - menus stay empty */
          }
          // Subtitles off by default; the viewer opts in from the menu.
          try {
            player.setSilentSubtitle(true);
          } catch {
            /* not supported on this stream */
          }
          const resumeAt = startAtRef.current;
          const begin = () => {
            if (!live) return;
            player.play();
            setPhase("playing");
          };
          if (resumeAt > 0) {
            player.seekTo(resumeAt, begin, begin);
          } else {
            begin();
          }
        },
        (error) => fail(String(error)),
      );
    } catch (error) {
      // Deferred so it isn't a synchronous setState in the effect body.
      const detail = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => fail(detail));
    }
    return () => {
      live = false;
      // Stop before close, or the player keeps the final frame on screen.
      try {
        player.stop();
      } catch {
        /* already idle */
      }
      try {
        player.close();
      } catch {
        /* already closed */
      }
    };
    // audioLanguages/subtitleLanguages/fallbacks are read once at prepare time;
    // they don't change for a given title, so they're intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, active, fail]);

  const play = useCallback(() => {
    const player = window.webapis?.avplay;
    if (!player) return;
    try {
      player.play();
      setPhase("playing");
    } catch {
      /* ignore - state unchanged */
    }
  }, []);

  const pause = useCallback(() => {
    const player = window.webapis?.avplay;
    if (!player) return;
    try {
      player.pause();
      setPhase("paused");
    } catch {
      /* ignore - state unchanged */
    }
  }, []);

  const togglePlay = useCallback(() => {
    setPhase((current) => {
      const player = window.webapis?.avplay;
      if (!player || (current !== "playing" && current !== "paused")) {
        return current;
      }
      try {
        if (current === "playing") {
          player.pause();
          return "paused";
        }
        player.play();
        return "playing";
      } catch {
        return current;
      }
    });
  }, []);

  const seekBy = useCallback((deltaMs: number) => {
    const player = window.webapis?.avplay;
    if (!player) return;
    try {
      const from = player.getCurrentTime();
      const total = player.getDuration();
      const target = Math.max(0, Math.min(from + deltaMs, Math.max(total - 1000, 0)));
      // Reflect the jump immediately; oncurrentplaytime will confirm it.
      setCurrentTime(target);
      player.seekTo(target);
    } catch {
      /* seek unsupported at this state */
    }
  }, []);

  const seekTo = useCallback((ms: number) => {
    const player = window.webapis?.avplay;
    if (!player) return;
    try {
      const total = player.getDuration();
      const target = Math.max(0, Math.min(ms, Math.max(total - 1000, 0)));
      // Reflect the jump immediately; oncurrentplaytime will confirm it.
      setCurrentTime(target);
      player.seekTo(target);
    } catch {
      /* seek unsupported at this state */
    }
  }, []);

  const selectAudio = useCallback((index: number) => {
    const player = window.webapis?.avplay;
    if (!player) return;
    try {
      player.setSelectTrack("AUDIO", index);
      setActiveAudio(index);
    } catch {
      /* switching failed - keep the current track */
    }
  }, []);

  const selectSubtitle = useCallback((index: number | null) => {
    const player = window.webapis?.avplay;
    if (!player) return;
    try {
      if (index === null) {
        player.setSilentSubtitle(true);
      } else {
        player.setSelectTrack("TEXT", index);
        player.setSilentSubtitle(false);
      }
      setActiveSubtitle(index);
    } catch {
      /* switching failed - keep the current selection */
    }
  }, []);

  return {
    phase,
    errorDetail,
    currentTime,
    duration,
    audioTracks,
    subtitleTracks,
    activeAudio,
    activeSubtitle,
    togglePlay,
    play,
    pause,
    seekBy,
    seekTo,
    selectAudio,
    selectSubtitle,
  };
}
