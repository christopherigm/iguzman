import { Get } from '../communicator';

type Props = {
  URLBase: string;
  userID: number;
  jwt: string;
};

const GetUser = ({ URLBase, userID, jwt }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/users/${userID}/`;
    Get({ url, jwt })
      .then((response) => res(response.data))
      .catch((error) => rej(error));
  });
};

export default GetUser;
