import {
  SLIDES_DATA
} from 'src/constants/SystemConstants';

const initialState: any = {};

const SlidesReducer = (state = initialState, action: any): any => {
  switch ( action.type ) {
    case SLIDES_DATA:
      const newData = { ...state, ...action.data };
      return newData;
    default:
      return state;
  }
};

export default SlidesReducer;
