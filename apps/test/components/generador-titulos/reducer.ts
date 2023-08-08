import type {Action} from 'utils';

export type State = {
  proyecto: string;
  edificio: string;
  empresa: string;
  fecha: string;
  titulo: string;
  comentario: string;
  revision: string;
  numeroPlano: string;
  iniciales: string;
  tipoTitulo: string;
  sistema: string;
  formato: string;
  disciplina: string;
  tipo: string;
  nivel: string;
  unidad: string;
};

export const InitialState: State = {
  proyecto: '',
  edificio: '',
  empresa: '',
  fecha: '',
  titulo: '',
  comentario:'',
  revision: '',
  numeroPlano: '',
  iniciales: '',
  tipoTitulo: '',
  sistema: '',
  formato: '',
  disciplina: '',
  tipo: '',
  nivel: '',
  unidad: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      proyecto: '',
      edificio: '',
      empresa: '',
      fecha: '',
      titulo: '',
      comentario:'',
      revision: '',
      numeroPlano: '',
      iniciales: '',
      tipoTitulo: '',
      sistema: '',
      formato: '',
      disciplina: '',
      tipo: '',
      nivel: '',
      unidad: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};
