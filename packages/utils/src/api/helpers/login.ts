import { Post } from '../communicator';
import * as jose from 'jose';
import type { JWTPayload } from '../../interfaces/jwt-interface';

type payloadInterface = {
  username: string;
  password: string;
};

type response = {
  data: {
    access: string;
    refresh: string;
  };
  errors?: Array<{
    code: string;
    detail: string;
    source: {
      pointer: string;
    };
    status: string;
  }>;
};

type Props = {
  URLBase: string;
  attributes: payloadInterface;
};

const Login = ({ URLBase, attributes }: Props): Promise<JWTPayload> => {
  return new Promise((res, rej) => {
    const url = `${URLBase}/v1/token/`;
    Post({
      url,
      data: {
        type: 'TokenObtainPairView',
        attributes,
      },
    })
      .then((response: response) => {
        if (response.errors) {
          return rej(response.errors);
        }
        const claims = jose.decodeJwt(response.data.access) as JWTPayload;
        claims.access = response.data.access;
        claims.refresh = response.data.refresh;
        res(claims);
      })
      .catch((error: any) => {
        console.log('error>', error);
        rej(error);
      });
  });
};

export default Login;
