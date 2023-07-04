import Login from './helpers/login';
import Register from './helpers/register';
import ActivateUser from './helpers/activate-user';
import ResetPassword from './helpers/reset-password';
import SetPassword from './helpers/set-password';
import GetUser from './helpers/get-user';
import {
  Get,
  Post
} from './communicator';

const API = {
  Get,
  Post,
  Login,
  Register,
  ActivateUser,
  ResetPassword,
  SetPassword,
  GetUser
};

export default API;
