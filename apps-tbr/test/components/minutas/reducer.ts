import type {Action} from 'utils';

export type State = {
  fecha: string;
  horaInicio: string;
  horafin: string;
  ubicacion: string;
  proyecto: string;
  edificio: string;
  modalidad: string;
  organizador: string,
  empresasParticipantes: string;
  integranteEmpresa: string;
  temaAsunto: string;
  idTema: string;
  categoriaTema: string;
  empresaTitulo: string;
  idEmpresatema: string;
  responsableTema: string;
  compromiso: string;
  etiqueta: string;
};

export interface RegistroEmpresas {
  empresasParticipantes: string;
  integranteEmpresa: string;
};

export interface Empresas extends RegistroEmpresas {
  empresasParticipantes: string;
  integranteEmpresa: string;
};

export interface RegistroEventos {
  idTema: string;
  categoriaTema: string;
  empresaTitulo: string;
  idEmpresatema: string;
  responsableTema: string;
  compromiso: string;
  etiqueta: string;
};

export interface Eventos extends RegistroEventos {
  idTema: string;
  categoriaTema: string;
  empresaTitulo: string;
  idEmpresatema: string;
  responsableTema: string;
  compromiso: string;
  etiqueta: string;
};

export const InitialState: State = {
  fecha: '',
  horaInicio: '',
  horafin: '',
  ubicacion: '',
  proyecto: '',
  edificio: '',
  modalidad: '',
  organizador: '',
  empresasParticipantes: '',
  integranteEmpresa: '',
  temaAsunto: '',
  idTema: '',
  categoriaTema: '',
  empresaTitulo: '',
  idEmpresatema: '',
  responsableTema: '',
  compromiso: '',
  etiqueta: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      fecha: '',
      horaInicio: '',
      horafin: '',
      ubicacion: '',
      proyecto: '',
      edificio: '',
      modalidad: '',
      organizador: '',
      empresasParticipantes: '',
      integranteEmpresa: '',
      temaAsunto: '',
      idTema: '',
      categoriaTema: '',
      empresaTitulo: '',
      idEmpresatema: '',
      responsableTema: '',
      compromiso: '',
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
