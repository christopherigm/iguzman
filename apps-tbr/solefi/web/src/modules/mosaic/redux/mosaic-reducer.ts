import {
  MOSAIC_DATA
} from 'src/constants/SystemConstants';

const initialState: any = {};

const MosaicReducer = (state = initialState, action: any): any => {
  switch ( action.type ) {
    case MOSAIC_DATA:
      const newData = { ...state, ...action.data };
      return newData;
    default:
      return state;
  }
};

export default MosaicReducer;
