export type JWTPayload = {
  exp: number;
  iat: number;
  jti: string;
  token_type: string;
  user_id: number;
  access: string;
  refresh: string;
};
