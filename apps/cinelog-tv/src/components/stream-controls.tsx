import { Focusable } from "@repo/ui-tv/focusable";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvText } from "@repo/ui-tv/tv-typography";
import { useT } from "@/i18n/provider";
import type { StreamPlayer } from "./use-stream-player";
import "./stream-controls.css";

/** Stable focus key so the overlay can return focus here when it reveals the bar. */
export const PLAYPAUSE_FOCUS_KEY = "stream-playpause";

/** The track menus the transport bar can open above itself. */
export type StreamMenu = "audio" | "subtitles" | null;

const SKIP_MS = 10_000;

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

/** A single audio/subtitle option list rendered above the transport buttons. */
function TrackMenu({
  title,
  options,
  activeIndex,
  onSelect,
}: {
  title: string;
  options: { key: string; label: string; index: number | null }[];
  activeIndex: number | null;
  onSelect: (index: number | null) => void;
}) {
  return (
    <div className="stream-controls__menu">
      <TvText variant="label" className="stream-controls__menu-title">
        {title}
      </TvText>
      <Focusable group focusOnMount className="stream-controls__menu-list">
        {options.map((opt) => (
          <TvButton
            key={opt.key}
            selected={opt.index === activeIndex}
            onPress={() => onSelect(opt.index)}
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
  visible,
  menu,
  onOpenMenu,
  onStop,
}: {
  player: StreamPlayer;
  visible: boolean;
  menu: StreamMenu;
  onOpenMenu: (menu: Exclude<StreamMenu, null>) => void;
  onStop: () => void;
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
    seekBy,
    selectAudio,
    selectSubtitle,
  } = player;

  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const cls = ["stream-controls", visible ? "" : "stream-controls--hidden"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      {menu === "audio" && (
        <TrackMenu
          title={t("audio")}
          activeIndex={activeAudio}
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
          activeIndex={activeSubtitle}
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
          {formatTime(currentTime)}
        </TvText>
        <div className="stream-controls__bar" aria-hidden="true">
          <div
            className="stream-controls__bar-fill"
            style={{ width: `${pct}%` }}
          />
        </div>
        <TvText variant="label" className="stream-controls__time">
          {formatTime(duration)}
        </TvText>
      </div>

      <Focusable group className="stream-controls__buttons">
        <TvButton onPress={() => seekBy(-SKIP_MS)}>{t("skipBack")}</TvButton>
        <TvButton focusKey={PLAYPAUSE_FOCUS_KEY} kind="primary" onPress={togglePlay}>
          {phase === "playing" ? t("pause") : t("play")}
        </TvButton>
        <TvButton onPress={() => seekBy(SKIP_MS)}>{t("skipForward")}</TvButton>
        <TvButton
          disabled={audioTracks.length < 2}
          selected={menu === "audio"}
          onPress={() => onOpenMenu("audio")}
        >
          {t("audio")}
        </TvButton>
        <TvButton
          disabled={subtitleTracks.length === 0}
          selected={menu === "subtitles"}
          onPress={() => onOpenMenu("subtitles")}
        >
          {t("subtitles")}
        </TvButton>
        <TvButton kind="error" onPress={onStop}>
          {t("stop")}
        </TvButton>
      </Focusable>
    </div>
  );
}
