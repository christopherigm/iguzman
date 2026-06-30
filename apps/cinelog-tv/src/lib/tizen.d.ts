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

interface TizenApplicationManager {
  launch(id: string, onSuccess?: () => void, onError?: (error: unknown) => void): void;
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

interface TizenStatic {
  application: TizenApplicationManager;
  ApplicationControl: new (
    operation: string,
    uri?: string | null,
    mime?: string | null,
    category?: string | null,
    data?: TizenApplicationControlData[],
  ) => TizenApplicationControl;
  ApplicationControlData: new (key: string, value: string[]) => TizenApplicationControlData;
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
  setDisplayRect(left: number, top: number, width: number, height: number): void;
  setListener(listener: AVPlayListener): void;
  prepare(): void;
  prepareAsync(success: () => void, error: (error: unknown) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  getState(): string;
}

interface WebApis {
  avplay: AVPlay;
}

declare global {
  interface Window {
    tizen?: TizenStatic;
    webapis?: WebApis;
  }
}
