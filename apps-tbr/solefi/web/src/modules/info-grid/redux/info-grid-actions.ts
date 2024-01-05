import {
  INFO_GRID_DATA
} from 'src/constants/SystemConstants';

const setInfoGridData = ( data: any ): any => {
  return {
    type: INFO_GRID_DATA,
    data: data
  };
};

export default setInfoGridData;
