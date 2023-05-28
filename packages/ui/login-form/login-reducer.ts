import type { Action } from 'utils';

type State = {
  login: boolean,
  username: string,
  password: string,
  keepMeLoggedIn: boolean,
  error?: string
};

export const initialState: State = {
  login: false,
  username: '',
  password: '',
  keepMeLoggedIn: false
};

const LoginReducer = (state: State = initialState, action: Action): State => {
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

export default LoginReducer;
