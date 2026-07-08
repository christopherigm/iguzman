import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { Focusable } from "@repo/ui-tv/focusable";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvText } from "@repo/ui-tv/tv-typography";
import { TV_KEYS } from "@repo/ui-tv/remote-keys";
import { useT } from "@/i18n/provider";
import {
  clearResumePoint,
  getResumePoint,
  saveResumePoint,
} from "@/lib/resume-store";
import { useStreamPlayer } from "./use-stream-player";
import { useSkipBurst } from "./use-skip-burst";
import {
  StreamControls,
  PLAYPAUSE_FOCUS_KEY,
  PROGRESS_FOCUS_KEY,
  formatTime,
  type StreamMenu,
} from "./stream-controls";
// `.av-player` (the AVPlay display placeholder) lives with the shared AvPlayer.
import "./av-player.css";
import "./stream-overlay.css";

// Hide the transport bar this long after the last key press (while playing).
const HIDE_MS = 5000;
// Persist the playhead at most this often while playing (belt-and-suspenders on
// top of the pause/stop/unmount saves, in case of a hard power-off).
const SAVE_EVERY_MS = 10_000;

/**
 * Fullscreen in-app player for a self-hosted digital copy - a direct media
 * stream on a personal bucket (e.g. S3), not an external provider we deep-link
 * into. Decodes through the Samsung native AVPlay hardware plane behind the
 * transparent webview.
 *
 * Adds a 10-foot transport layer over that plane: an auto-hiding control bar
 * (play/pause, ±10s skip, audio and subtitle tracks, stop) that any remote key
 * wakes, plus a "resume or start over" prompt when a saved position exists. The
 * playhead is persisted to localStorage (keyed by `storageKey`) on pause, stop,
 * unmount (remote Back) and periodically, so reopening the title can resume.
 *
 * Remote Back closes an open track menu first; otherwise the parent screen
 * handles it to close this overlay (and this component's unmount saves the
 * position on the way out).
 */
export function StreamOverlay({
  url,
  storageKey,
  audioLanguages,
  subtitleLanguages,
  onClose,
}: {
  url: string;
  /** Stable per-title key for the resume position (the movie slug). */
  storageKey: string;
  /** Movie spoken-language names, used to label audio tracks (see hook). */
  audioLanguages: string[];
  /** Movie subtitle-language names, used to label subtitle tracks. */
  subtitleLanguages: string[];
  onClose: () => void;
}) {
  const { t } = useT();

  // Read the saved position once so the initial mode is stable across renders.
  const saved = useMemo(() => getResumePoint(storageKey), [storageKey]);
  const [mode, setMode] = useState<"prompt" | "play">(
    saved ? "prompt" : "play",
  );
  const [resumeAt, setResumeAt] = useState(0);

  const handleError = useCallback(() => {
    /* the hook already flips its phase to "error"; nothing extra to do here */
  }, []);
  const handleEnded = useCallback(() => {
    clearResumePoint(storageKey);
    onClose();
  }, [storageKey, onClose]);

  const player = useStreamPlayer({
    url,
    active: mode === "play",
    startAt: resumeAt,
    audioLanguages,
    subtitleLanguages,
    audioFallback: t("audioTrack"),
    subtitleFallback: t("subtitleTrack"),
    onError: handleError,
    onEnded: handleEnded,
  });

  const { phase, togglePlay, play, pause } = player;

  // Skip-burst state shared with the transport bar; the key router below also
  // drives it (Left/Right while the bar is hidden), so a scrub started from the
  // bare stream and one started on the progress bar are the same burst. The
  // callbacks are referentially stable, so effects can depend on them directly.
  const burst = useSkipBurst(player);
  const { skip: skipBurst, commit: commitBurst, isPending: burstPending } = burst;

  // ----- resume prompt -----
  const startPlayback = (at: number) => {
    setResumeAt(at);
    setMode("play");
  };
  const onResume = () => startPlayback(saved ? saved.position : 0);
  const onStartOver = () => {
    clearResumePoint(storageKey);
    startPlayback(0);
  };

  // ----- refs holding the latest state for async listeners/handlers -----
  // All written from an effect below, never during render (per react-hooks/refs).
  const currentRef = useRef(0);
  const durationRef = useRef(0);
  const phaseRef = useRef(phase);
  const lastSavedRef = useRef(0);
  const controlsVisibleRef = useRef(true);
  const menuRef = useRef<StreamMenu>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const focusedOnceRef = useRef(false);

  // Keep the async-read refs in step with render state. Declared first so it
  // runs before the persistence/visibility effects that read these refs.
  useEffect(() => {
    currentRef.current = player.currentTime;
    durationRef.current = player.duration;
    phaseRef.current = phase;
  });

  // ----- persistence -----
  const persist = useCallback(() => {
    saveResumePoint(storageKey, {
      position: currentRef.current,
      duration: durationRef.current,
    });
  }, [storageKey]);

  // Save on unmount (covers remote Back and the Stop button, both of which
  // unmount this overlay via the parent).
  useEffect(() => () => persist(), [persist]);
  // Save on pause.
  useEffect(() => {
    if (phase === "paused") persist();
  }, [phase, persist]);
  // Throttled save while playing.
  useEffect(() => {
    if (phase !== "playing") return;
    if (Math.abs(player.currentTime - lastSavedRef.current) >= SAVE_EVERY_MS) {
      lastSavedRef.current = player.currentTime;
      persist();
    }
  }, [player.currentTime, phase, persist]);

  // ----- control bar visibility + track menu -----
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState<StreamMenu>(null);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    // Keep the bar up while paused or with a menu open.
    if (phaseRef.current === "playing" && !menuRef.current) {
      hideTimerRef.current = setTimeout(() => {
        controlsVisibleRef.current = false;
        setControlsVisible(false);
      }, HIDE_MS);
    }
  }, []);

  const revealControls = useCallback(() => {
    controlsVisibleRef.current = true;
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // Explicitly dismiss the transport bar (Up from the progress bar). Wins over
  // the capture-phase `revealControls` fired by the same key press because both
  // setState calls batch and this one runs last; the ref write is likewise last.
  const hideControls = useCallback(() => {
    clearTimeout(hideTimerRef.current);
    controlsVisibleRef.current = false;
    setControlsVisible(false);
  }, []);

  const openMenu = useCallback(
    (next: Exclude<StreamMenu, null>) => {
      menuRef.current = next;
      setMenu(next);
      revealControls();
    },
    [revealControls],
  );
  const closeMenu = useCallback(() => {
    menuRef.current = null;
    setMenu(null);
    revealControls();
  }, [revealControls]);
  // Close the menu and drop focus back onto the transport row (Down from the
  // menu's last option), so the remote lands somewhere once the menu is gone.
  const closeMenuToBar = useCallback(() => {
    closeMenu();
    setFocus(PLAYPAUSE_FOCUS_KEY);
  }, [closeMenu]);

  // On the playing/paused transition, adjust the auto-hide timer without
  // touching the bar's current visibility (so no setState in this effect): keep
  // it up while paused, re-arm the countdown while playing. Also grab D-pad
  // focus onto the transport the first time it appears, so the remote lands
  // somewhere once autoplay starts.
  useEffect(() => {
    if (phase === "paused") {
      clearTimeout(hideTimerRef.current);
    } else if (phase === "playing") {
      scheduleHide();
    }
    if (
      (phase === "playing" || phase === "paused") &&
      !focusedOnceRef.current
    ) {
      focusedOnceRef.current = true;
      requestAnimationFrame(() => setFocus(PLAYPAUSE_FOCUS_KEY));
    }
  }, [phase, scheduleHide]);

  // Route remote keys during playback. Capture phase so a press we handle is
  // swallowed before Norigin (bubble) - and the parent screen's Back handler -
  // act on it.
  //
  //   Back    - closes an open menu, else hides a visible bar, else (bar already
  //             hidden) falls through to the parent screen, which closes the overlay.
  //   Play/Pause media keys - toggle (or force play/pause) and wake the bar.
  //   Left/Right while the bar is hidden - run the skip burst and wake the bar so
  //             its progress preview shows (mirrors scrubbing the progress bar).
  //   any other key while hidden - just wakes the bar; while visible keeps it awake.
  useEffect(() => {
    if (mode !== "play") return;
    const onKey = (event: KeyboardEvent) => {
      const code = event.keyCode;
      const swallow = () => {
        event.stopPropagation();
        event.preventDefault();
      };
      if (code === TV_KEYS.BACK) {
        if (menuRef.current) {
          closeMenu();
          setFocus(PLAYPAUSE_FOCUS_KEY);
          swallow();
          return;
        }
        // Back on the visible bar dismisses it rather than leaving the player;
        // only a Back with the bar already hidden closes the overlay (parent).
        if (controlsVisibleRef.current) {
          hideControls();
          swallow();
        }
        return;
      }
      if (code === TV_KEYS.MEDIA_PLAY_PAUSE) {
        togglePlay();
        revealControls();
        swallow();
        return;
      }
      if (code === TV_KEYS.MEDIA_PLAY) {
        play();
        revealControls();
        swallow();
        return;
      }
      if (code === TV_KEYS.MEDIA_PAUSE) {
        pause();
        revealControls();
        swallow();
        return;
      }
      if (!controlsVisibleRef.current) {
        // Left/Right on the bare stream scrub; land focus on the progress bar so
        // further presses continue the burst through its own arrow handler.
        if (code === TV_KEYS.LEFT || code === TV_KEYS.RIGHT) {
          skipBurst(code === TV_KEYS.RIGHT ? 1 : -1);
          revealControls();
          setFocus(PROGRESS_FOCUS_KEY);
          swallow();
          return;
        }
        revealControls();
        setFocus(PLAYPAUSE_FOCUS_KEY);
        swallow();
        return;
      }
      revealControls();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    mode,
    togglePlay,
    play,
    pause,
    revealControls,
    hideControls,
    closeMenu,
    skipBurst,
  ]);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  // Commit any in-flight skip burst when the bar hides mid-scrub (auto-hide, Up,
  // or Back) so the accumulated seek isn't dropped; deferred out of the effect
  // body (setState-in-effect) per react-hooks rules.
  useEffect(() => {
    if (!controlsVisible && burstPending()) queueMicrotask(commitBurst);
  }, [controlsVisible, burstPending, commitBurst]);

  if (phase === "error") {
    return (
      <div className="stream-overlay">
        <div className="stream-overlay__message">
          <TvText variant="title">{t("digitalCopyUnavailable")}</TvText>
          {/* Raw AVPlay error string - identifies which fix the file needs
              (unsupported codec vs container vs network/Content-Type). */}
          {player.errorDetail ? (
            <TvText variant="body">{player.errorDetail}</TvText>
          ) : null}
        </div>
      </div>
    );
  }

  if (mode === "prompt" && saved) {
    return (
      <div className="stream-overlay">
        <div className="stream-overlay__message">
          <TvText variant="title">{t("resumeTitle")}</TvText>
          <TvText variant="body">
            {t("resumeFrom")} {formatTime(saved.position)}
          </TvText>
          <Focusable group focusOnMount className="stream-overlay__actions">
            <TvButton kind="primary" onPress={onResume}>
              {t("resume")}
            </TvButton>
            <TvButton onPress={onStartOver}>{t("startOver")}</TvButton>
          </Focusable>
        </div>
      </div>
    );
  }

  return (
    <div className="stream-overlay">
      {/* An <object> of this type is the AVPlay display placeholder; the decoded
          video paints on its hardware plane behind the transparent overlay. */}
      <object type="application/avplayer" className="av-player" />

      {phase === "loading" && (
        <div className="stream-overlay__message stream-overlay__message--loading">
          <TvText variant="title">{t("loading")}</TvText>
        </div>
      )}

      {(phase === "playing" || phase === "paused") && (
        <StreamControls
          player={player}
          burst={burst}
          visible={controlsVisible}
          menu={menu}
          onOpenMenu={openMenu}
          onCloseMenu={closeMenuToBar}
          onStop={onClose}
          onHide={hideControls}
        />
      )}
    </div>
  );
}
