import {
  MOSAIC_DATA
} from 'src/constants/SystemConstants';

const setMosaicData = ( data: any ): any => {
  return {
    type: MOSAIC_DATA,
    data: data
  };
};

export default setMosaicData;
