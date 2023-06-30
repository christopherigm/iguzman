import Login from './helpers/login';
import Register from './helpers/register';
import ActivateUser from './helpers/activate-user';
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
  GetUser
};

export default API;
