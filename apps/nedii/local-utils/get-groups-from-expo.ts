import {
  Get,
  RebuildData
} from 'utils';
import type {
  JSONAPICommonArrayResponse,
} from 'utils';
import type {
  ExpoInterface
} from 'interfaces/stand-interface';

type Props = {
  URLBase: string;
  expoID: number;
};

type Response = {
  data: ExpoInterface;
} & JSONAPICommonArrayResponse;

const GetGroupsFromExpos = ({
    URLBase,
    expoID,
  }: Props ): Promise<ExpoInterface> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/expos/${expoID}/?include=groups&fields[Expo]=id,groups`;
    Get({url})
      .then((response: Response) => res(RebuildData(response).data))
      .catch(error => rej(error));
  });
};

export default GetGroupsFromExpos;
