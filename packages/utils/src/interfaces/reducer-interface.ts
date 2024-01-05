export type Dispatch<A> = (action: A) => void;

type Types =
  | 'setState'
  | 'clearState'
  | 'loading'
  | 'success'
  | 'error'
  | 'clearErrors'
  | 'login'
  | 'input'
  | 'item';

export type Action<Item, Error> = {
  type: Types;
  name?: string;
  value?: string | boolean | number;
  state?: any;
  error?: Array<Error>;
  item?: Item;
};
