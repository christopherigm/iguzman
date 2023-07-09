import type {APIPostCreationError} from '../interfaces/api-error-handler';

interface CreationErrorInput {
  detail: string;
  status: number;
  source: {
    pointer: string;
  };
  code: string;
};

export const APICreationErrorHandler = (error: Array<CreationErrorInput>): Array<APIPostCreationError> => {
  const e: Array<CreationErrorInput> = error;
  const newArray: Array<APIPostCreationError> = [];
  for (let i = 0; i < e.length; i++) {
    let pointer = '';
    if (e[i].source && e[i].source.pointer) {
      const p = e[i].source.pointer.split('/');
      pointer = String(p[p.length-1]);
    }
    const element: APIPostCreationError = {
      detail: e[i].detail,
      status: Number(e[i].status),
      pointer,
      code: e[i].code,
    };
    newArray.push(element);
  }
  return newArray;
};
