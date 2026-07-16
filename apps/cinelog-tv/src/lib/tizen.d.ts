// Minimal ambient typings for the Tizen Web Device API surface this app uses.
export {};

interface TizenApplicationControlData {
  key: string;
  value: string[];
}

interface TizenApplicationControl {
  operation: string;
}

interface TizenApplicationInformation {
  id: string;
  name: string;
  packageId: string;
}

interface TizenCurrentApplication {
  exit(): void;
}

interface TizenApplicationManager {
  getCurrentApplication(): TizenCurrentApplication;
  launch(
    id: string,
    onSuccess?: () => void,
    onError?: (error: unknown) => void,
  ): void;
  launchAppControl(
    control: TizenApplicationControl,
    id?: string | null,
    onSuccess?: () => void,
    onError?: (error: unknown) => void,
    replyCallback?: unknown,
  ): void;
  getAppsInfo(
    onSuccess: (apps: TizenApplicationInformation[]) => void,
    onError?: (error: unknown) => void,
  ): void;
}

interface TizenInputDeviceKey {
  name: string;
  code: number;
}

/**
 * `tizen.tvinputdevice` - controls which remote keys the platform delivers as
 * KeyboardEvents. Media-transport keys (Play/Pause/FF/Rewind) are withheld until
 * an app registers them by name; the always-on arrow/Enter/Back keys are not
 * listed here. Absent in the dev browser/emulator.
 */
interface TizenInputDeviceManager {
  getSupportedKeys(): TizenInputDeviceKey[];
  registerKey(keyName: string): void;
  unregisterKey(keyName: string): void;
}

interface TizenStatic {
  application: TizenApplicationManager;
  tvinputdevice?: TizenInputDeviceManager;
  ApplicationControl: new (
    operation: string,
    uri?: string | null,
    mime?: string | null,
    category?: string | null,
    data?: TizenApplicationControlData[],
  ) => TizenApplicationControl;
  ApplicationControlData: new (
    key: string,
    value: string[],
  ) => TizenApplicationControlData;
}

/**
 * Subset of the Samsung AVPlay listener used by the in-app trailer player. Every
 * field is optional - AVPlay only invokes the ones provided.
 */
interface AVPlayListener {
  onbufferingstart?: () => void;
  onbufferingprogress?: (percent: number) => void;
  onbufferingcomplete?: () => void;
  onstreamcompleted?: () => void;
  oncurrentplaytime?: (currentTime: number) => void;
  onerror?: (eventType: string) => void;
  onevent?: (eventType: string, eventData: string) => void;
}

/**
 * Samsung product AVPlay API (the native TV media player). Provided by the
 * device's `$WEBAPIS/webapis/webapis.js`; absent in the dev browser/emulator.
 */
interface AVPlay {
  open(url: string): void;
  close(): void;
  setDisplayRect(
    left: number,
    top: number,
    width: number,
    height: number,
  ): void;
  setDisplayMethod(
    method:
      | "PLAYER_DISPLAY_MODE_LETTER_BOX"
      | "PLAYER_DISPLAY_MODE_FULL_SCREEN"
      | "PLAYER_DISPLAY_MODE_AUTO_ASPECT_RATIO",
  ): void;
  setListener(listener: AVPlayListener): void;
  prepare(): void;
  prepareAsync(success: () => void, error: (error: unknown) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  getState(): string;
  /** Total media length in milliseconds; valid once the player is prepared. */
  getDuration(): number;
  /** Current playhead in milliseconds. */
  getCurrentTime(): number;
  /** Jump to an absolute position (ms). Valid in READY/PLAYING/PAUSED. */
  seekTo(
    milliseconds: number,
    success?: () => void,
    error?: (error: unknown) => void,
  ): void;
  /** All audio/video/text tracks in the prepared stream. */
  getTotalTrackInfo(): AVPlayTrackInfo[];
  /** Switch the active track of a kind by its `AVPlayTrackInfo.index`. */
  setSelectTrack(type: "AUDIO" | "VIDEO" | "TEXT", index: number): void;
  /** `true` hides in-container subtitles; `false` renders the selected TEXT track. */
  setSilentSubtitle(silent: boolean): void;
}

interface WebApis {
  avplay: AVPlay;
}

declare global {
  /**
   * One entry from `AVPlay.getTotalTrackInfo()`. `extra_info` is a JSON string
   * whose shape varies by track type/device - for AUDIO/TEXT it usually carries
   * a `language` (or `track_lang`) code the player-side code parses defensively.
   * Global so the player hook can annotate track arrays with it directly.
   */
  interface AVPlayTrackInfo {
    index: number;
    type: "AUDIO" | "VIDEO" | "TEXT";
    extra_info: string;
  }

  interface Window {
    tizen?: TizenStatic;
    webapis?: WebApis;
  }
}
