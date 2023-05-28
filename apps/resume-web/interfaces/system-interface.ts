import type {System as BaseSystem} from 'utils';
import type UserInterface from 'interfaces/user-interface';

export default interface System extends BaseSystem {
  user: UserInterface | null;
  favorites: Array<any>;
  cart: Array<any>;
  users: Array<UserInterface>;
};

export type setSystem = (s: System) => void;

export const SystemInitalState: System = {
  URLBase: '',
  defaultLanguage: 'en',
  loginEnabled: false,
  cartEnabled: false,
  favoritesEnabled: false,
  ordersEnabled: false,
  language: 'en',
  darkMode: false,
  devMode: false,
  globalAlert: {},
  isLoading: [],

  user: null,
  favorites: [],
  cart: [],
  users: []
};
