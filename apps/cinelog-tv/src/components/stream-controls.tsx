import { setFocus } from "@noriginmedia/norigin-spatial-navigation";
import { Focusable } from "@repo/ui-tv/focusable";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvText } from "@repo/ui-tv/tv-typography";
import { useT } from "@/i18n/provider";
import forwardIcon from "@/icons/forward.svg";
import backwardIcon from "@/icons/backward.svg";
import type { StreamPlayer } from "./use-stream-player";
import { SKIP_STEP_KEYS, type SkipBurst } from "./use-skip-burst";
import "./stream-controls.css";

/** Stable focus key so the overlay can return focus here when it reveals the bar. */
export const PLAYPAUSE_FOCUS_KEY = "stream-playpause";

/** Focus key for the scrubbable progress bar (Left/Right seek). */
export const PROGRESS_FOCUS_KEY = "stream-progress";

/** Focus keys for the track buttons, so a closing menu can return focus here. */
export const AUDIO_FOCUS_KEY = "stream-audio";
export const SUBTITLES_FOCUS_KEY = "stream-subtitles";

/** The track menus the transport bar can open above itself. */
export type StreamMenu = "audio" | "subtitles" | null;

/** ms -> `H:MM:SS` (or `M:SS` under an hour). */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * A single audio/subtitle option list rendered above the transport buttons.
 * `align` pins it under the button that opened it (audio left, subtitles right).
 * Down from the last option closes the menu (it's the bottom-most focusable, so
 * Down otherwise goes nowhere) and hands focus back to the button that opened it
 * (`returnFocusKey`).
 */
function TrackMenu({
  title,
  options,
  activeIndex,
  align,
  onSelect,
  onCloseMenu,
  returnFocusKey,
}: {
  title: string;
  options: { key: string; label: string; index: number | null }[];
  activeIndex: number | null;
  align: "left" | "right";
  onSelect: (index: number | null) => void;
  onCloseMenu: () => void;
  returnFocusKey: string;
}) {
  const cls =
    "stream-controls__menu" +
    (align === "right" ? " stream-controls__menu--right" : "");
  return (
    <div className={cls}>
      <TvText variant="label" className="stream-controls__menu-title">
        {title}
      </TvText>
      <Focusable group focusOnMount className="stream-controls__menu-list">
        {options.map((opt, i) => (
          <TvButton
            key={opt.key}
            selected={opt.index === activeIndex}
            onPress={() => onSelect(opt.index)}
            onArrowPress={
              i === options.length - 1
                ? (direction) => {
                    if (direction === "down") {
                      onCloseMenu();
                      setFocus(returnFocusKey);
                      return false;
                    }
                    return true;
                  }
                : undefined
            }
          >
            {opt.label}
          </TvButton>
        ))}
      </Focusable>
    </div>
  );
}

/**
 * Auto-hiding transport bar over the AVPlay stream: a progress track plus skip,
 * play/pause, audio, subtitle and stop actions. `visible` drives the fade; the
 * parent overlay owns the reveal/hide timing and D-pad key routing. The audio
 * and subtitle menus open above the bar when their `menu` state is set.
 */
export function StreamControls({
  player,
  burst,
  visible,
  menu,
  onOpenMenu,
  onCloseMenu,
  onStop,
  onHide,
}: {
  player: StreamPlayer;
  /** Shared skip-burst state (also driven by the overlay while the bar hides). */
  burst: SkipBurst;
  visible: boolean;
  menu: StreamMenu;
  onOpenMenu: (menu: Exclude<StreamMenu, null>) => void;
  onCloseMenu: () => void;
  onStop: () => void;
  onHide: () => void;
}) {
  const { t } = useT();
  const {
    phase,
    currentTime,
    duration,
    audioTracks,
    subtitleTracks,
    activeAudio,
    activeSubtitle,
    togglePlay,
    selectAudio,
    selectSubtitle,
  } = player;
  const { pending, skipStep, skip } = burst;

  // While a burst is in flight the bar renders the pending target instead of the
  // (paused) playhead, so the viewer watches it slide toward where they're headed.
  const displayTime = pending ?? currentTime;
  const pct = duration > 0 ? Math.min(100, (displayTime / duration) * 100) : 0;
  const cls = ["stream-controls", visible ? "" : "stream-controls--hidden"]
    .filter(Boolean)
    .join(" ");

  const skipLabel = (sign: "-" | "+") => `${sign}${t(SKIP_STEP_KEYS[skipStep]!)}`;

  // While the progress bar holds focus: Left/Right run the same escalating skip
  // burst as the transport buttons (30s -> 1min -> 3min, previewed then
  // committed), so scrubbing the bar feels identical to Netflix. Down lands on
  // the play/pause button; Up dismisses the whole transport bar (nothing sits
  // above it) for an unobstructed view of the stream. Every handled arrow
  // returns `false` to block Norigin's default geometry navigation.
  const onSeekArrow = (direction: string): boolean => {
    if (direction === "left") {
      skip(-1);
      return false;
    }
    if (direction === "right") {
      skip(1);
      return false;
    }
    if (direction === "down") {
      setFocus(PLAYPAUSE_FOCUS_KEY);
      return false;
    }
    if (direction === "up") {
      onHide();
      return false;
    }
    return false;
  };

  // While any transport button holds focus: Down dismisses the whole bar (the
  // button row is the bottom-most focusable, so Down otherwise goes nowhere),
  // mirroring Up on the progress bar. Other arrows fall through to Norigin's
  // default geometry navigation between the buttons.
  const onButtonArrow = (direction: string): boolean => {
    if (direction === "down") {
      onHide();
      return false;
    }
    return true;
  };

  return (
    <div className={cls}>
      {menu === "audio" && (
        <TrackMenu
          title={t("audio")}
          align="left"
          activeIndex={activeAudio}
          returnFocusKey={AUDIO_FOCUS_KEY}
          onCloseMenu={onCloseMenu}
          onSelect={(i) => i !== null && selectAudio(i)}
          options={audioTracks.map((track, i) => ({
            key: `a${track.index}`,
            label: track.label || `${t("audioTrack")} ${i + 1}`,
            index: track.index,
          }))}
        />
      )}
      {menu === "subtitles" && (
        <TrackMenu
          title={t("subtitles")}
          align="right"
          activeIndex={activeSubtitle}
          returnFocusKey={SUBTITLES_FOCUS_KEY}
          onCloseMenu={onCloseMenu}
          onSelect={selectSubtitle}
          options={[
            { key: "off", label: t("subtitlesOff"), index: null },
            ...subtitleTracks.map((track, i) => ({
              key: `s${track.index}`,
              label: track.label || `${t("subtitleTrack")} ${i + 1}`,
              index: track.index,
            })),
          ]}
        />
      )}

      <div className="stream-controls__progress">
        <TvText variant="label" className="stream-controls__time">
          {formatTime(displayTime)}
        </TvText>
        <Focusable
          focusKey={PROGRESS_FOCUS_KEY}
          className="stream-controls__bar-focus"
          onArrowPress={onSeekArrow}
        >
          {({ focused }) => (
            <div
              className="stream-controls__bar"
              role="slider"
              aria-label={t("seek")}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(displayTime)}
            >
              <div
                className="stream-controls__bar-fill"
                style={{ width: `${pct}%` }}
              />
              <div
                className={
                  "stream-controls__thumb" +
                  (focused ? " stream-controls__thumb--focused" : "")
                }
                style={{ left: `${pct}%` }}
              />
            </div>
          )}
        </Focusable>
        <TvText variant="label" className="stream-controls__time">
          {formatTime(duration)}
        </TvText>
      </div>

      <Focusable group className="stream-controls__buttons">
        <TvButton
          focusKey={AUDIO_FOCUS_KEY}
          disabled={audioTracks.length < 2}
          selected={menu === "audio"}
          onPress={() => onOpenMenu("audio")}
          onArrowPress={onButtonArrow}
        >
          {t("audio")}
        </TvButton>

        <div className="stream-controls__buttons-center">
          <TvButton
            icon={backwardIcon}
            onPress={() => skip(-1)}
            onArrowPress={onButtonArrow}
          >
            {skipLabel("-")}
          </TvButton>
          <TvButton
            focusKey={PLAYPAUSE_FOCUS_KEY}
            kind="primary"
            onPress={togglePlay}
            onArrowPress={onButtonArrow}
          >
            {phase === "playing" ? t("pause") : t("play")}
          </TvButton>
          <TvButton kind="error" onPress={onStop} onArrowPress={onButtonArrow}>
            {t("stop")}
          </TvButton>
          <TvButton
            icon={forwardIcon}
            iconPosition="end"
            onPress={() => skip(1)}
            onArrowPress={onButtonArrow}
          >
            {skipLabel("+")}
          </TvButton>
        </div>

        <TvButton
          focusKey={SUBTITLES_FOCUS_KEY}
          disabled={subtitleTracks.length === 0}
          selected={menu === "subtitles"}
          onPress={() => onOpenMenu("subtitles")}
          onArrowPress={onButtonArrow}
        >
          {t("subtitles")}
        </TvButton>
      </Focusable>
    </div>
  );
}
