import {
  HOW_IT_WORKS_DATA
} from 'src/constants/SystemConstants';

const setHowItWorksData = ( data: any ): any => {
  return {
    type: HOW_IT_WORKS_DATA,
    data: data
  };
};

export default setHowItWorksData;
