import type {Action} from 'utils';

export interface RegistroEmpresa {
  nombreEmpresa: string;
  rfcEmpresa: string;
  sectorGiroEmpresa: string;
  regimenFiscal: string;
  calle: string;
  numeroExterior: string;
  numeroInterior: string;
  colonia: string;
  localidad: string;
  entidad: string;
  codigoPostal: string;
};

export interface State extends RegistroEmpresa {
  nombreEmpresa: string;
  rfcEmpresa: string;
  sectorGiroEmpresa: string;
  regimenFiscal: string;
  calle: string;
  numeroExterior: string;
  numeroInterior: string;
  colonia: string;
  localidad: string;
  entidad: string;
  codigoPostal: string;
};

export const InitialState: State = {
  nombreEmpresa: '',
  rfcEmpresa: '',
  sectorGiroEmpresa: '',
  regimenFiscal: '',
  calle: '',
  numeroExterior: '',
  numeroInterior: '',
  colonia: '',
  localidad: '',
  entidad: '',
  codigoPostal: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      nombreEmpresa: '',
      rfcEmpresa: '',
      sectorGiroEmpresa: '',
      regimenFiscal: '',
      calle: '',
      numeroExterior: '',
      numeroInterior: '',
      colonia: '',
      localidad: '',
      entidad: '',
      codigoPostal: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};
