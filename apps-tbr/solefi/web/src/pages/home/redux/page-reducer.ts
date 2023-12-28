import {
  PAGE_DATA
} from 'src/constants/SystemConstants';

const initialState: any = {};

const PageReducer = (state = initialState, action: any): any => {
  switch ( action.type ) {
    case PAGE_DATA:
      const newData = { ...state, ...action.data };
      return newData;
    default:
      return state;
  }
};

export default PageReducer;
