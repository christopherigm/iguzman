export type Dispatch<A> = (action: A) => void;

type Types =
  'loading' |
  'success' |
  'error' |
  'login' |
  'input';

export type Action = {
  type: Types;
  name?: string;
  value?: string;
  error?: string;
};
