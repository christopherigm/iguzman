import { Get } from '../communicator';

type Props = {
  URLBase: string;
  jwt: string;
};

const GetUserAddress = ({ URLBase, jwt }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/user-address/`;
    Get({ url, jwt })
      .then((response) => res(response.data))
      .catch((error) => rej(error));
  });
};

export default GetUserAddress;
