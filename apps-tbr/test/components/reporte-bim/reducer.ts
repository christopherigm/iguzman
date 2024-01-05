import type {Action} from 'utils';

export interface ReporteBim {
  fecha: string;
  proyecto: string;
  reporte: string;
  edificio: string;
  bimCoordinator: string;
  sistema: string;
  actividad: string;
  estatus: string;
  comentario: string;
  ubicacion: string;
};

export interface State extends ReporteBim  {
  fecha: string;
  proyecto: string;
  reporte: string;
  edificio: string;
  bimCoordinator: string;
  sistema: string;
  actividad: string;
  estatus: string;
  comentario: string;
  ubicacion: string;
};

export const InitialState: State = {
  fecha: '',
  proyecto: '',
  reporte: '',
  edificio: '',
  bimCoordinator: '',
  sistema: '',
  actividad: '',
  estatus: '',
  comentario: '',
  ubicacion: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      fecha: '',
      proyecto: '',
      reporte: '',
      edificio: '',
      bimCoordinator: '',
      sistema: '',
      actividad: '',
      estatus: '',
      comentario: '',
      ubicacion: '',
    };
  } else if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action')
};
