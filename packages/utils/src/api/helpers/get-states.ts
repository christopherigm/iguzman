import { Get } from '../communicator';
import type {
  JSONAPICommonArrayResponse,
  StateInterface,
} from '../../interfaces/common-interfaces';

type Props = {
  URLBase: string;
  jwt?: string;
};

type Response = {
  data: Array<StateInterface>;
} & JSONAPICommonArrayResponse;

export const GetStates = ({ URLBase, jwt }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/states/?page[size]=100`;
    Get({ url, jwt })
      .then((response: Response) => res(response.data))
      .catch((error) => rej(error));
  });
};

type PropsByCountry = {
  URLBase: string;
  countryID: number;
  jwt?: string;
};

export const GetStatesByCountryID = ({
  URLBase,
  countryID,
  jwt,
}: PropsByCountry): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/states/?filter[country]=${countryID}&page[size]=100`;
    Get({ url, jwt })
      .then((response: Response) => res(response))
      .catch((error) => rej(error));
  });
};
