import { Post } from '../communicator';

type payloadInterface = {
  username: string;
  email: string;
  password: string;
};

type Props = {
  URLBase: string,
  attributes: payloadInterface,
};

const Register = ({
    URLBase,
    attributes
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/users/`;
    Post({
      url,
      type: 'User',
      attributes
    })
      .then((response: any) => {
        if (response.errors) {
          return rej(response.errors);
        }
        res(response.data);
      })
      .catch((error: any) => {
        rej(error);
      });
  });
};

export default Register;
