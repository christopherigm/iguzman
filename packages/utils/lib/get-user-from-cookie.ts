import {API} from 'utils';
import * as jose from 'jose';

type Props = {
  jwt?: string;
};

const GetUserFromCookie = (cookies: Props): Promise<any> => {
  return new Promise((res) => {
    if (cookies.jwt) {
      const jwt = cookies.jwt;
      const URLBase = String(process.env.URL_BASE);
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
