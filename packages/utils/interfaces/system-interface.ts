export type Languages = 'en' | 'es' | null;

export interface EnvironmentVariables {
  hostName: string
  URLBase: string;
  K8sURLBase: string;
  defaultLanguage: string;
  loginEnabled: boolean;
  cartEnabled: boolean;
  favoritesEnabled: boolean;
  ordersEnabled: boolean;
  version: string;
};

export interface CachedValues {
  language: Languages;
  darkMode: boolean;
  devMode: boolean;
}

export interface System extends EnvironmentVariables, CachedValues {
  paths: Array<string>;
  isLoading: boolean;
  globalAlert?: any;
};

export type setSystem = (s: any) => void;
