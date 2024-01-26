import type {Action} from 'utils';

export type State = {
  proyecto: string;
  edificio: string;
  fecha: string;
  sistema: string;
  categoria: string;
  otraCategoria: string;
  empresa: string;
  otraEmpresa: string;
  descripcion: string;
  etiqueta: string;
};

export interface Reportes {
  sistema: string;
  categoria: string;
  otraCategoria: string;
  otraEmpresa: string;
  empresa: string;
  descripcion: string;
  etiqueta: string;
};

export interface RegistroReportes extends Reportes {
  sistema: string;
  categoria: string;
  otraCategoria: string;
  empresa: string;
  otraEmpresa: string;
  descripcion: string;
  etiqueta: string;
};

export const InitialState: State = {
  proyecto: '',
  edificio: '',
  fecha: '',
  sistema: '',
  categoria: '',
  otraCategoria: '',
  empresa: '',
  otraEmpresa: '',
  descripcion: '',
  etiqueta: '',
};


export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      proyecto: '',
      edificio: '',
      fecha: '',
      sistema: '',
      categoria: '',
      otraCategoria: '',
      empresa: '',
      otraEmpresa: '',
      descripcion: '',
      etiqueta: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};

