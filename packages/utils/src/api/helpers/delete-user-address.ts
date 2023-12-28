import { Delete } from '../communicator';

type Props = {
  URLBase: string;
  jwt: string;
  id: number;
};

const DeleteUserAddress = ({ URLBase, jwt, id }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/user-address/${id}/`;
    Delete({
      url,
      jwt,
    })
      .then(() => res(null))
      .catch((error) => rej(error));
  });
};

export default DeleteUserAddress;
