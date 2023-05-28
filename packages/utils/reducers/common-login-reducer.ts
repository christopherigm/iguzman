import type { Action } from 'utils';

export type CommonLoginState = {
  login: boolean,
  username: string,
  password: string,
  keepMeLoggedIn: boolean,
  error?: string,
};

export const CommonLoginInitialState: CommonLoginState = {
  login: false,
  username: '',
  password: '',
  keepMeLoggedIn: false
};

const CommonLoginReducer = (state: CommonLoginState = CommonLoginInitialState, action: Action): CommonLoginState => {
  if (action.type === 'login') {
    return {
      ...state,
      login: true
    };
  }
  if (action.type === 'success') {
    return {
      ...state,
      username: '',
      password: '',
      login: false,
      error: undefined
    };
  }
  if (action.type === 'error' && action.error) {
    return {
      ...state,
      login: false,
      error: action.error
    };
  }
  if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error();
};

export default CommonLoginReducer;
