import {
  LOGIN,
  USER
} from 'src/constants/SystemConstants';

export const SetUserData = ( data: any ): any => {
  return {
    type: USER,
    data: data
  };
};

export const SetLoginData = ( data: any ): any => {
  return {
    type: LOGIN,
    data: data
  };
};
