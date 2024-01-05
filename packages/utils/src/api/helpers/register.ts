import { Post } from '../communicator';

type payloadInterface = {
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  img_picture?: string;
};

type Props = {
  URLBase: string;
  attributes: payloadInterface;
};

const Register = ({ URLBase, attributes }: Props): Promise<any> => {
  if (!attributes.img_picture) {
    delete attributes.img_picture;
  }
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/users/`;
    Post({
      url,
      data: {
        type: 'User',
        attributes,
      },
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
