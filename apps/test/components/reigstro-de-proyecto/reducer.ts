import type {Action} from 'utils';

export interface RegistroProyecto {
  nombreProyecto: string;
  fechaInicio: string;
  fechaFin: string;
  numContrato: string;
  ubicacionProyecto: string;
  cliente: string;
};

export interface State extends RegistroProyecto {
  nombreProyecto: string;
  fechaInicio: string;
  fechaFin: string;
  numContrato: string;
  ubicacionProyecto: string;
  cliente: string;
};

export const InitialState: State = {
  nombreProyecto: '',
  fechaInicio: '',
  fechaFin: '',
  numContrato: '',
  ubicacionProyecto: '',
  cliente: '',
};

export const Reducer = (state: State = InitialState, action: Action): State => {
  if (action.type === 'success') {
    return {
      ...state,
      nombreProyecto: '',
      fechaInicio: '',
      fechaFin: '',
      numContrato: '',
      ubicacionProyecto: '',
      cliente: '',
    };
  } else  if (action.type === 'input' && action.name) {
    return {
      ...state,
      [action.name]: action.value
    };
  }
  throw new Error('Invalid action');
};
