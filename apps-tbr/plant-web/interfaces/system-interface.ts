import type {System as BaseSystem} from 'utils';
import type UserInterface from 'interfaces/user-interface';
import type PlantInterface from 'interfaces/plant-interface';
import type MeasurementInterface from 'interfaces/measurement-interface';

export default interface System extends BaseSystem {
  user: UserInterface | null;
  plants: Array<PlantInterface>;
  plant: PlantInterface | null;
  plantSlug: string;
  measurements: Array<MeasurementInterface>;
};

export type setSystem = (s: System) => void;

export const SystemInitalState: System = {
  version: '0.0.1',
  paths: [
    '/',
    '/plant'
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
  plants: [],
  plant: null,
  plantSlug: '',
  measurements: []
};
