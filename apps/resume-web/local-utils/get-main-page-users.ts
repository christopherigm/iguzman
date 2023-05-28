import {API} from 'utils';

type Props = {
  URLBase: string;
};

const GetMainPageUsers = ({
    URLBase
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/users/`;
    API.Get({url})
      .then(response => res(response.data))
      .catch(error => rej(error));
  });
};

export default GetMainPageUsers;
