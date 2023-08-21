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

const GetCountries = ({
    URLBase,
    jwt
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/countries/`;
    Get({url, jwt})
      .then((response: Response) => res(response.data))
      .catch(error => rej(error));
  });
};

export default GetCountries;
