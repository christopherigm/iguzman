import {
  SLIDES_DATA
} from 'src/constants/SystemConstants';

const setSlidesData = ( data: any ): any => {
  return {
    type: SLIDES_DATA,
    data: data
  };
};

export default setSlidesData;
