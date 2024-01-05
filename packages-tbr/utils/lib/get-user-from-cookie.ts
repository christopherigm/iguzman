import {API} from 'utils';
import * as jose from 'jose';

type Props = {
  URLBase: string;
  jwt?: string;
};

const GetUserFromCookie = ({
    jwt,
    URLBase,
  }: Props): Promise<any> => {
  return new Promise((res) => {
    if (jwt) {
      const claims: any = jose.decodeJwt(jwt);
      API.GetUser({
        URLBase,
        userID: claims.user_id,
        jwt: jwt
      })
        .then(d => res(d))
        .catch(_e => res(null));
    } else {
      res(null);
    }
  });
};

export default GetUserFromCookie;
