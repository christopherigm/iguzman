import {
  Get,
} from 'utils';
import type {
  JSONAPICommonArrayResponse,
} from 'utils';
import type {
  ExpoInterface
} from 'interfaces/stand-interface';

type Props = {
  URLBase: string;
};

type Response = {
  data: Array<ExpoInterface>;
} & JSONAPICommonArrayResponse;

const GetExpos = ({
    URLBase,
  }: Props ): Promise<Array<ExpoInterface>> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/expos/`;
    Get({url})
      .then((response: Response) => res(response.data))
      .catch(error => rej(error));
  });
};

export default GetExpos;
