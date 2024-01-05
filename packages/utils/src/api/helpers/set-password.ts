import { Post } from '../communicator';

type payloadInterface = {
  token: string;
  password: string;
};

type Props = {
  URLBase: string;
  attributes: payloadInterface;
};

const SetPassword = ({ URLBase, attributes }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/set-password`;
    Post({
      url,
      data: {
        type: 'SetPassword',
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

export default SetPassword;
