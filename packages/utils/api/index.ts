import Login from './helpers/login';
import Register from './helpers/register';
import ActivateUser from './helpers/activate-user';
import ResetPassword from './helpers/reset-password';
import SetPassword from './helpers/set-password';
import GetUser from './helpers/get-user';
import UpdateUser from './helpers/update-user';
import GetUserAddress from './helpers/get-user-address';
import CreateUserAddress from './helpers/create-user-address';
import UpdateUserAddress from './helpers/update-user-address';
import DeleteUserAddress from './helpers/delete-user-address';
import {
  Get,
  Post,
  Patch,
  Delete,
} from './communicator';

const API = {
  Get,
  Post,
  Patch,
  Delete,
  Login,
  Register,
  ActivateUser,
  ResetPassword,
  SetPassword,
  GetUser,
  UpdateUser,
  GetUserAddress,
  CreateUserAddress,
  UpdateUserAddress,
  DeleteUserAddress,
};

export default API;
