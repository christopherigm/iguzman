import { Post } from '../communicator';

type payloadInterface = {
  email: string;
};

type Props = {
  URLBase: string;
  attributes: payloadInterface;
};

const ResetPassword = ({ URLBase, attributes }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/reset-password`;
    Post({
      url,
      data: {
        type: 'ResetPassword',
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

export default ResetPassword;
