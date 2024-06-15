import { Get } from '../communicator';
import type {
  JSONAPICommonArrayResponse,
  CityInterface,
} from '../../interfaces/common-interfaces';

type Props = {
  URLBase: string;
  jwt?: string;
};

type Response = {
  data: Array<CityInterface>;
} & JSONAPICommonArrayResponse;

export const GetCities = ({ URLBase, jwt }: Props): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/cities/?page[size]=100`;
    Get({ url, jwt })
      .then((response: Response) => res(response.data))
      .catch((error) => rej(error));
  });
};

type PropsCitiesByState = {
  URLBase: string;
  stateID: number;
  jwt?: string;
};

export const GetCitiesByStateID = ({
  URLBase,
  stateID,
  jwt,
}: PropsCitiesByState): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/cities/?filter[state]=${stateID}&page[size]=100`;
    Get({ url, jwt })
      .then((response: Response) => res(response))
      .catch((error) => rej(error));
  });
};
