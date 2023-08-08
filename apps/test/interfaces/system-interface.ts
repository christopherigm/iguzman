import type {System as BaseSystem} from 'utils';
import type UserInterface from 'interfaces/user-interface';

export default interface System extends BaseSystem {
  user: UserInterface | null;
  token?: string;
};

export type setSystem = (s: System) => void;

export const SystemInitalState: System = {
  version: '0.0.1',
  paths: [
    '/',
  ],
  hostName: '',
  URLBase: '',
  K8sURLBase: '',
  defaultLanguage: 'en',
  loginEnabled: false,
  cartEnabled: false,
  favoritesEnabled: false,
  ordersEnabled: false,
  language: 'en',
  darkMode: false,
  devMode: false,
  globalAlert: {},
  isLoading: false,

  user: null,
};
