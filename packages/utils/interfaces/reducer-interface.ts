export type Dispatch<A> = (action: A) => void;

type Types =
  'setState' |
  'clearState' |
  'loading' |
  'success' |
  'error' |
  'clearErrors' |
  'login' |
  'input';

export type Action = {
  type: Types;
  name?: string;
  value?: string | boolean | number;
  state?: any;
  error?: Array<any>;
};
