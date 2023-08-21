import { Get } from 'utils';
import type { ExpoInterface } from 'interfaces/stand-interface';

type Props = {
  URLBase: string;
  id: number;
};

type Response = {
  data: ExpoInterface;
};

const GetExpoByID = ({
    URLBase,
    id,
  }: Props ): Promise<ExpoInterface> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/expos/${id}/`;
    Get({url})
      .then((response: Response) => res(response.data))
      .catch(error => rej(error));
  });
};

export default GetExpoByID;
