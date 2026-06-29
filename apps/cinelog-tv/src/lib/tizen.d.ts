// Minimal ambient typings for the Tizen Web Device API surface this app uses.
export {};

interface TizenApplicationControlData {
  key: string;
  value: string[];
}

interface TizenApplicationControl {
  operation: string;
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

declare global {
  interface Window {
    tizen?: TizenStatic;
  }
}
