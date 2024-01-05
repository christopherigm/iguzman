import {
  SWITCH_DARK_MODE,
  SET_MOBILE_PLATOFORM
} from 'src/constants/SystemConstants';

const initialState: any = {
  darkMode: false,
  platform: {
    os: 'web',
    prefix: ''
  }
};

const SystemReducer = (state = initialState, action: any): any => {
  switch ( action.type ) {
    case SWITCH_DARK_MODE:
      return { ...state, ...{ darkMode: action.data }};
    case SET_MOBILE_PLATOFORM:
      return { ...state, ...{ platform: action.data }};
    default:
      return state;
  }
};

export default SystemReducer;
