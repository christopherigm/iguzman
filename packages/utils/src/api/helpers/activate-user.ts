import { Post } from '../communicator';

type payloadInterface = {
  token: string;
};

type Props = {
  URLBase: string;
  attributes: payloadInterface;
};

const ActivateUser = ({ URLBase, attributes }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/activate-user`;
    Post({
      url,
      data: {
        type: 'ActivateUser',
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

export default ActivateUser;
