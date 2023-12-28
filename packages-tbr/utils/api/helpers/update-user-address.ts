import { Patch } from '../communicator';
import type {
  UserAddressAttributesInterface,
} from '../../interfaces/user-address-attributes-interface';

type Relationships = {
  city?: {
    data: any
  };
  user: {
    data: any
  }
};

type PropsUpdateUserAddress = {
  URLBase: string;
  jwt: string;
  attributes: UserAddressAttributesInterface;
  relationships: Relationships;
  id: number;
};

const UpdateUserAddress = ({
    URLBase,
    jwt,
    attributes,
    relationships,
    id,
  }: PropsUpdateUserAddress ): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/user-address/${id}/`;
    Patch({
      url,
      jwt,
      data: {
        type: 'UserAddress',
        id: id,
        attributes,
        relationships,
      }
    })
      .then(response => res(response.data))
      .catch(error => rej(error));
  });
};

export default UpdateUserAddress;
