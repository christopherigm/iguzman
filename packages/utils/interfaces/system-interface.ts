export type Languages = 'en' | 'es' | null;

export interface EnvironmentVariables {
  URLBase: string;
  defaultLanguage: string;
  loginEnabled: boolean;
  cartEnabled: boolean;
  favoritesEnabled: boolean;
  ordersEnabled: boolean;
};

export interface CachedValues {
  language: Languages;
  darkMode: boolean;
  devMode: boolean;
}

export interface System extends EnvironmentVariables, CachedValues {
  isLoading?: Array<boolean>;
  globalAlert?: any;
};

export type setSystem = (s: any) => void;
