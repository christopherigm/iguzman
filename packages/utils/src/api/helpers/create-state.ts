import { Post } from '../communicator';
import {
  JSONAPICommonArrayResponse,
  StateInterface,
} from '../../interfaces/common-interfaces';

type Props = {
  URLBase: string;
  name: string;
  country: number;
};

type Response = {
  data: Array<StateInterface>;
} & JSONAPICommonArrayResponse;

const CreateState = ({ URLBase, name, country }: Props): Promise<any> => {
  const data = {
    type: 'State',
    attributes: {
      name,
    },
    relationships: {
      country: {
        data: {
          id: country,
          type: 'Country',
        },
      },
    },
  };
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/states/`;
    Post({
      url,
      data,
    })
      .then((response: Response) => res(response.data))
      .catch((error) => rej(error));
  });
};

export default CreateState;
