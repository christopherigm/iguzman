import {
  PAGE_DATA
} from 'src/constants/SystemConstants';

const setPageData = ( data: any ): any => {
  return {
    type: PAGE_DATA,
    data: data
  };
};

export default setPageData;
