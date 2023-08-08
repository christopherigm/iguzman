import { Get } from 'utils';

type Props = {
  URLBase: string;
  jwt: string;
  userID: number;
};

const GetUserCompanies = ({
    URLBase,
    jwt,
    userID,
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/stands/?filter[owner]=${userID}`;
    Get({url, jwt})
      .then(response => res(response.data))
      .catch(error => rej(error));
  });
};

export default GetUserCompanies;
