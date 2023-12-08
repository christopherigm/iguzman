import {
  SET_MOBILE_PLATOFORM
} from 'src/constants/SystemConstants';

const SetMobilePlatform = ( data: any ): any => {
  return {
    type: SET_MOBILE_PLATOFORM,
    data: data
  };
};

export default SetMobilePlatform;
