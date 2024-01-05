import { Post } from '../communicator';
import {
  JSONAPICommonArrayResponse,
  CityInterface,
} from '../../interfaces/common-interfaces';

type Props = {
  URLBase: string;
  name: string;
  state: number;
};

type Response = {
  data: Array<CityInterface>;
} & JSONAPICommonArrayResponse;

const CreateCity = ({ URLBase, name, state }: Props): Promise<any> => {
  const data = {
    type: 'City',
    attributes: {
      name,
    },
    relationships: {
      state: {
        data: {
          id: state,
          type: 'State',
        },
      },
    },
  };
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/cities/`;
    Post({
      url,
      data,
    })
      .then((response: Response) => res(response.data))
      .catch((error) => rej(error));
  });
};

export default CreateCity;
