import type {Action} from 'utils';

export interface Registro {
  nombre: string;
  unidadMedicion: string;
  categoria: string;
};

export interface State extends Registro {
  nombre: string;
  unidadMedicion: string;
  categoria: string;
};

export const InitialState: State = {
  nombre: '',
  unidadMedicion: '',
  categoria: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      nombre: '',
      unidadMedicion: '',
      categoria: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};