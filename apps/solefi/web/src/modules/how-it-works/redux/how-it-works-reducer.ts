import {
  HOW_IT_WORKS_DATA
} from 'src/constants/SystemConstants';

const initialState: any = {};

const HowItWorksReducer = (state = initialState, action: any): any => {
  switch ( action.type ) {
    case HOW_IT_WORKS_DATA:
      const newData = { ...state, ...action.data };
      return newData;
    default:
      return state;
  }
};

export default HowItWorksReducer;
