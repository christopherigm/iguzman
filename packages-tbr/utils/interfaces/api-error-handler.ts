export interface APIPostCreationError {
  detail: string;
  status: number;
  pointer: string;
  code: string;
};

export interface CreationErrorInput {
  detail: string;
  status: number;
  source: {
    pointer: string;
  };
  code: string;
};
