import {
  Post,
  RebuildData
} from 'utils';
import type {
  JSONAPICommonArrayResponse,
} from 'utils';
import type {
  GroupInterface
} from 'interfaces/stand-interface';

type Payload = {
  name: string;
  description?: string;
  img_picture?: string;
  icon?: string;
  color?: string;
};

type Props = {
  URLBase: string;
  payload: Payload;
};

type Response = {
  data: GroupInterface;
};

const CreateGroupAPI = ({
    URLBase,
    payload,
  }: Props ): Promise<GroupInterface> => {
  const data = {
    type: 'Group',
    attributes: {
      ...payload,
      enabled: false,
    },
  };
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/groups/`;
    Post({
      url,
      data
    })
      .then((response: Response) => res(response.data))
      .catch(error => rej(error));
  });
};

export default CreateGroupAPI;
