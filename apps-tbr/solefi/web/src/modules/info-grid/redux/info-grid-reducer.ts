import {
  INFO_GRID_DATA
} from 'src/constants/SystemConstants';

const initialState: any = {};

const InfoGridReducer = (state = initialState, action: any): any => {
  switch ( action.type ) {
    case INFO_GRID_DATA:
      const newData = { ...state, ...action.data };
      return newData;
    default:
      return state;
  }
};

export default InfoGridReducer;
