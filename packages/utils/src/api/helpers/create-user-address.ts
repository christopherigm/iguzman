import { Post } from '../communicator';
import type { UserAddressAttributesInterface } from '../../interfaces/user-address-attributes-interface';

type Relationships = {
  city?: {
    data: any;
  };
  user: {
    data: any;
  };
};

type PropsCreateUserAddress = {
  URLBase: string;
  jwt: string;
  attributes: UserAddressAttributesInterface;
  relationships: Relationships;
};

const CreateUserAddress = ({
  URLBase,
  jwt,
  attributes,
  relationships,
}: PropsCreateUserAddress): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/user-address/`;
    Post({
      url,
      jwt,
      data: {
        type: 'UserAddress',
        attributes,
        relationships,
      },
    })
      .then((response) => res(response.data))
      .catch((error) => rej(error));
  });
};

export default CreateUserAddress;
