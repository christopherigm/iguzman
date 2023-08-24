import type {Action} from 'utils';

export interface RegistroAvances {
  disciplina: string;
  subDisciplina: string;
  nivel: string;
  partida: string;
  subPartida: string;
  cantidad: string;
  unidad: string;
  modo: string;
  ubicacion: string;
  comentarioAdicional: string;
};

export interface State extends RegistroAvances {
  disciplina: string;
  subDisciplina: string;
  nivel: string;
  partida: string;
  subPartida: string;
  cantidad: string;
  unidad: string;
  modo: string;
  ubicacion: string;
  comentarioAdicional: string;
};

export const InitialState: State = {
  disciplina: '',
  subDisciplina: '',
  nivel: '',
  partida: '',
  subPartida: '',
  cantidad: '',
  unidad: '',
  modo: '',
  ubicacion: '',
  comentarioAdicional: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      disciplina: '',
      subDisciplina: '',
      nivel: '',
      partida: '',
      subPartida: '',
      cantidad: '',
      unidad: '',
      modo: '',
      ubicacion: '',
      comentarioAdicional: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};
