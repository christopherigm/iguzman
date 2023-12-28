import type {Action} from 'utils';

export interface RegistroDisciplina {
  disciplina: string;
  subDisciplina: string;
  fechaInicio: string;
  fechaFin: string;
  responsable: string;
};

export interface State extends RegistroDisciplina {
  disciplina: string;
  subDisciplina: string;
  fechaInicio: string;
  fechaFin: string;
  responsable: string;
};

export const InitialState: State = {
  disciplina: '',
  subDisciplina: '',
  fechaInicio: '',
  fechaFin: '',
  responsable: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      disciplina: '',
      subDisciplina: '',
      fechaInicio: '',
      fechaFin: '',
      responsable: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error ('Invalid action')
};
