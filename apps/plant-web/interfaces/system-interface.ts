import type {System as BaseSystem} from 'utils';
import type UserInterface from 'interfaces/user-interface';
import type PlantInterface from 'interfaces/plant-interface';
import type MeasurementInterface from 'interfaces/measurement-interface';

export default interface System extends BaseSystem {
  user: UserInterface | null;
  plants: Array<PlantInterface>;
  plant: PlantInterface | null;
  measurements: Array<MeasurementInterface>;
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
  plants: [],
  plant: null,
  measurements: []
};
