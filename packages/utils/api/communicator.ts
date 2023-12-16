const jsonapiHeaders = {
  'Content-Type': 'application/vnd.api+json',
};
const regularHeaders = {
  'Content-Type': 'application/json',
};

type PostProps = {
  url: string;
  jwt?: string;
  data: any;
  jsonapi?: boolean;
};

export const Post = ({
  url,
  jwt,
  data,
  jsonapi = true,
}: PostProps): Promise<any> => {
  const common = jsonapi ? { ...jsonapiHeaders } : { ...regularHeaders };
  const headers = jwt
    ? {
        ...common,
        Authorization: `Bearer ${jwt}`,
      }
    : common;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: data,
      }),
    })
      .then((response) => response.json())
      .then((data) => res(data))
      .catch((error) => rej(error));
  });
};

type PatchProps = {
  url: string;
  jwt?: string;
  data: any;
  jsonapi?: boolean;
};

export const Patch = ({
  url,
  jwt,
  data,
  jsonapi = true,
}: PatchProps): Promise<any> => {
  const common = jsonapi ? { ...jsonapiHeaders } : { ...regularHeaders };
  const headers = jwt
    ? {
        ...common,
        Authorization: `Bearer ${jwt}`,
      }
    : common;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        data: data,
      }),
    })
      .then((response) => response.json())
      .then((data) => res(data))
      .catch((error) => rej(error));
  });
};

type GetProps = {
  url: string;
  jwt?: string;
  jsonapi?: boolean;
};

export const Get = ({ url, jwt, jsonapi = true }: GetProps): Promise<any> => {
  const common = jsonapi ? { ...jsonapiHeaders } : { ...regularHeaders };
  const headers = jwt
    ? {
        ...common,
        Authorization: `Bearer ${jwt}`,
      }
    : common;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'GET',
      headers,
    })
      .then((response) => response.json())
      .then((data) => res(data))
      .catch((error) => rej(error));
  });
};

type DeleteProps = {
  url: string;
  jwt?: string;
  jsonapi?: boolean;
};

export const Delete = ({
  url,
  jwt,
  jsonapi = true,
}: DeleteProps): Promise<any> => {
  const common = jsonapi ? { ...jsonapiHeaders } : { ...regularHeaders };
  const headers = jwt
    ? {
        ...common,
        Authorization: `Bearer ${jwt}`,
      }
    : common;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'DELETE',
      headers,
    })
      .then(() => res(null))
      .catch((error) => rej(error));
  });
};
