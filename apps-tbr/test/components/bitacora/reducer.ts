import type {Action} from 'utils';

export interface Reporte {
  fecha: string;
  categoria: string;
  otraCategoria: string;
  comentario: string;
  etiqueta: string;
  emisor: string;
};

export interface State extends Reporte {
  fecha: string;
  categoria: string;
  otraCategoria: string;
  comentario: string;
  etiqueta: string;
  emisor: string;
};

export const InitialState: State = {
  fecha: '',
  categoria: '',
  otraCategoria: '',
  comentario: '',
  etiqueta: '',
  emisor: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      fecha: '',
      categoria: '',
      otraCategoria: '',
      comentario: '',
      etiqueta: '',
      emisor: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};
