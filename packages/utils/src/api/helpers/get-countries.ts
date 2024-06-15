import { Get } from '../communicator';
import type {
  JSONAPICommonArrayResponse,
  CountryInterface,
} from '../../interfaces/common-interfaces';

type Props = {
  URLBase: string;
  jwt?: string;
};

type Response = {
  data: Array<CountryInterface>;
} & JSONAPICommonArrayResponse;

const GetCountries = ({ URLBase, jwt }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/countries/?page[size]=100`;
    Get({ url, jwt })
      .then((response: Response) => res(response))
      .catch((error) => rej(error));
  });
};

export default GetCountries;
