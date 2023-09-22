import type {Action} from 'utils';

export type State = {
  fecha: string;
  receptor: string;
  empresaReceptor: string;
  otraEmpresa: string;
  proyecto: string;
  edificio: string;
  ubicacion: string;
  asunto: string;
  numeroSeguimiento: string;
  categoria: string;
  disciplina: string;
  link: string;
  introduccion: string;
  comentario: string;
  anexo: string;
  cierreCorreo: string;
  etiqueta: string;
};

export interface Etiquetas {
  etiqueta: string;
};

export interface RegistroEtiquetas extends Etiquetas {
  etiqueta: string;
};

export const InitialState: State = {
  fecha: '',
  receptor: '',
  empresaReceptor: '',
  otraEmpresa: '',
  proyecto: '',
  edificio: '',
  ubicacion: '',
  asunto: '',
  numeroSeguimiento: '',
  categoria: '',
  disciplina: '',
  link: '',
  introduccion: '',
  comentario: '',
  anexo: '',
  cierreCorreo: '',
  etiqueta: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      fecha: '',
      receptor: '',
      empresaReceptor: '',
      otraEmpresa: '',
      proyecto: '',
      edificio: '',
      ubicacion: '',
      asunto: '',
      numeroSeguimiento: '',
      categoria: '',
      disciplina: '',
      link: '',
      introduccion: '',
      comentario: '',
      anexo: '',
      cierreCorreo: '',
      etiqueta: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error ('Invalid action');
};
