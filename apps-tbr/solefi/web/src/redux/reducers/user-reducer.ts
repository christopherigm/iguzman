import {
  USER
} from 'src/constants/SystemConstants';

const initialState: any = {};

export const UserReducer = (state = initialState, action: any): any => {
  switch ( action.type ) {
    case USER:
      return { ...state, ...action.data };
    default:
      return state;
  }
};
