import type {Action} from 'utils';

export interface RegistroRFI  {
  numeroRfi: string;
  tema: string;
  importancia: string;
  fechaInicio: string;
  fechaRespuesta: string;
  disciplina: string;
  categoria: string;
  compania: string;
  emitido: string;
  pregunta: string;
  preguntaIng: string;
 };

 export interface State extends RegistroRFI {
  numeroRfi: string;
  tema: string;
  importancia: string;
  fechaInicio: string;
  fechaRespuesta: string;
  disciplina: string;
  categoria: string;
  compania: string;
  emitido: string;
  pregunta: string;
  preguntaIng: string; 
 };


 export const InitialState: State = {
  numeroRfi: '',
  tema: '',
  importancia: '',
  fechaInicio: '',
  fechaRespuesta: '',
  disciplina: '',
  categoria: '',
  compania: '',
  emitido: '',
  pregunta: '',
  preguntaIng: '',
 };

 export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      numeroRfi: '',
      tema: '',
      importancia: '',
      fechaInicio: '',
      fechaRespuesta: '',
      disciplina: '',
      categoria: '',
      compania: '',
      emitido: '',
      pregunta: '',
      preguntaIng: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
 };
 