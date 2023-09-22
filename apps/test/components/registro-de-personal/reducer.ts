import type {Action} from 'utils';

export interface RegistroPersonal {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  anioNacimiento: string;
  numeroSeguro: string;
  numeroEmpleado: string;
  clasificacion: string;
  puesto: string;
  proyecto: string;
  numContrato: string;
  monitoreo: string;
  telefono: string;
  correo: string;
  calle: string;
  numeroExt: string;
  numInt: string;
  codigoPostal: string;
  colonia: string;
  ciudad: string;
  pais: string;
};

export interface State extends RegistroPersonal {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  anioNacimiento: string;
  numeroSeguro: string;
  numeroEmpleado: string;
  clasificacion: string;
  puesto: string;
  proyecto: string;
  numContrato: string;
  monitoreo: string;
  telefono: string;
  correo: string;
  calle: string;
  numeroExt: string;
  numInt: string;
  codigoPostal: string;
  colonia: string;
  ciudad: string;
  pais: string;
};

export const InitialState: State = {
  nombres: '',
  apellidoPaterno: '',
  apellidoMaterno: '',
  anioNacimiento: '',
  numeroSeguro: '',
  numeroEmpleado: '',
  clasificacion: '',
  puesto: '',
  proyecto: '',
  numContrato: '',
  monitoreo: '',
  telefono: '',
  correo: '',
  calle: '',
  numeroExt: '',
  numInt: '',
  codigoPostal: '',
  colonia: '',
  ciudad: '',
  pais: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      nombres: '',
      apellidoPaterno: '',
      apellidoMaterno: '',
      anioNacimiento: '',
      numeroSeguro: '',
      numeroEmpleado: '',
      puesto: '',
      telefono: '',
      correo: '',
      calle: '',
      numeroExt: '',
      numInt: '',
      codigoPostal: '',
      colonia: '',
      ciudad: '',
      pais: '',
      proyecto: '',
      numContrato: '',
      monitoreo: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error ('Invalid action');
};



