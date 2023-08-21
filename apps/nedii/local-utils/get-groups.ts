import {
  Get,
} from 'utils';
import type {
  JSONAPICommonArrayResponse,
} from 'utils';
import type {
  GroupInterface
} from 'interfaces/stand-interface';

type Props = {
  URLBase: string;
};

type Response = {
  data: Array<GroupInterface>;
} & JSONAPICommonArrayResponse;

const GetGroups = ({
    URLBase,
  }: Props ): Promise<Array<GroupInterface>> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/groups/`;
    Get({url})
      .then((response: Response) => res(response.data))
      .catch(error => rej(error));
  });
};

export default GetGroups;
