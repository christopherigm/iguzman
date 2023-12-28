import { Patch } from '../communicator';

type PropsUpdateUserAddress = {
  URLBase: string;
  jwt: string;
  attributes: any;
  relationships?: any;
  id: number;
};

const UpdateUser = ({
  URLBase,
  jwt,
  attributes,
  relationships,
  id,
}: PropsUpdateUserAddress): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/users/${id}/`;
    Patch({
      url,
      jwt,
      data: {
        type: 'User',
        id: id,
        attributes,
        relationships,
      },
    })
      .then((response) => res(response.data))
      .catch((error) => rej(error));
  });
};

export default UpdateUser;
