export type Dispatch<A> = (action: A) => void;

type Types =
  'setState' |
  'clearState' |
  'loading' |
  'success' |
  'error' |
  'login' |
  'input';

export type Action = {
  type: Types;
  name?: string;
  value?: string | boolean;
  state?: any;
  error?: Array<any>;
};
