import { Post } from 'utils';
import type { ExpoInterface } from 'interfaces/stand-interface';

type Payload = {
  name: string;
  email: string;
  description?: string;
  img_picture?: string;
  is_real: boolean;
};

type Props = {
  URLBase: string;
  payload: Payload;
  groupsSelected: Array<number>;
};

type Response = {
  data: ExpoInterface;
};

const CreateExpoAPI = ({
    URLBase,
    payload,
    groupsSelected,
  }: Props ): Promise<ExpoInterface> => {
  const data = {
    type: 'Expo',
    attributes: {
      ...payload,
      enabled: false,
    },
    relationships: {
      groups: {
        data: groupsSelected.map((i: number) => {
          return {
            type: 'Group',
            id: i,
          }
        })
      }
    }
  };
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/expos/`;
    Post({
      url,
      data
    })
      .then((response: Response) => res(response.data))
      .catch(error => rej(error));
  });
};

export default CreateExpoAPI;
