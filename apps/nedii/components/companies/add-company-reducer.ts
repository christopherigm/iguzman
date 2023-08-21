import {
  API,
  APICreationErrorHandler,
} from 'utils';
import type {
  APIPostCreationError,
  CreationErrorInput,
  Action,
} from 'utils';

export type State = {
  isLoading: boolean;

  expo: number;
  group: number;

  name: string;
  short_description: string;
  contact_email: string;
  restaurant: boolean;
  always_open: boolean;

  slogan?: string;
  description?: string;

  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;

  monday_open?: string;
  monday_close?: string;
  tuesday_open?: string;
  tuesday_close?: string;
  wednesday_open?: string;
  wednesday_close?: string;
  thursday_open?: string;
  thursday_close?: string;
  friday_open?: string;
  friday_close?: string;
  saturday_open?: string;
  saturday_close?: string;
  sunday_open?: string;
  sunday_close?: string;

  booking_active?: boolean;
  booking_fee?: number;
  booking_email?: string;

  country?: number;
  state?: number;
  city?: number;
  zip_code?: string;
  address?: string;
  about?: string;
  mission?: string;
  vision?: string;

  web_link?: string;
  facebook_link?: string;
  twitter_link?: string;
  instagram_link?: string;
  linkedin_link?: string;
  google_link?: string;
  youtube_link?: string;

  advancedOptions: boolean;
  error: Array<APIPostCreationError>;
};

export const InitialState: State = {
  isLoading: false,

  expo: 0,
  group: 0,

  name: '',
  short_description: '',
  contact_email: '',
  restaurant: false,
  always_open: false,

  slogan: '',
  description: '',

  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,

  monday_open: '',
  monday_close: '',
  tuesday_open: '',
  tuesday_close: '',
  wednesday_open: '',
  wednesday_close: '',
  thursday_open: '',
  thursday_close: '',
  friday_open: '',
  friday_close: '',
  saturday_open: '',
  saturday_close: '',
  sunday_open: '',
  sunday_close: '',

  booking_active: false,
  booking_fee: 0,
  booking_email: '',

  zip_code: '',
  address: '',
  about: '',
  mission: '',
  vision: '',

  web_link: '',
  facebook_link: '',
  twitter_link: '',
  instagram_link: '',
  linkedin_link: '',
  google_link: '',
  youtube_link: '',

  advancedOptions: false,
  error: []
};

export const Reducer = (state: State = InitialState, action: Action<null, CreationErrorInput>): State => {
  if (action.type === 'setState') {
    return {
      ...state,
      ...action.state,
    };
  } else if (action.type === 'clearState') {
    return {
      ...state,
      ...InitialState,
    };
  } else if (action.type === 'loading') {
    return {
      ...state,
      isLoading: true,
      error: [],
    };
  } else if (action.type === 'success') {
    return {
      ...state,
      error: [],
      isLoading: false,
    };
  } else if (action.type === 'error' && action.error) {
    return {
      ...state,
      error: APICreationErrorHandler(action.error),
      isLoading: false,
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};
