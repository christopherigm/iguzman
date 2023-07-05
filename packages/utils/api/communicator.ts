const headers = {
  'Content-Type': 'application/vnd.api+json'
};

type PostProps = {
  url: string;
  jwt?: string;
  data: any;
};

export const Post = ({
    url,
    jwt,
    data,
  }: PostProps): Promise<any> => {
  const h = jwt ? {
    ...headers, 
    Authorization: `Bearer ${jwt}`
  } : headers;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        data: data
      })
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
};

export const Patch = ({
    url,
    jwt,
    data,
  }: PatchProps): Promise<any> => {
  const h = jwt ? {
    ...headers, 
    Authorization: `Bearer ${jwt}`
  } : headers;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({
        data: data
      })
    })
    .then((response) => response.json())
    .then((data) => res(data))
    .catch((error) => rej(error));
  });
};

type GetProps = {
  url: string;
  jwt?: string;
};

export const Get = ({url, jwt}: GetProps): Promise<any> => {
  const h = jwt ? {
    ...headers, 
    Authorization: `Bearer ${jwt}`
  } : headers;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'GET',
      headers: h
    })
    .then((response) => response.json())
    .then((data) => res(data))
    .catch((error) => rej(error));
  });
};


type DeleteProps = {
  url: string;
  jwt?: string;
};

export const Delete = ({
    url,
    jwt,
  }: DeleteProps): Promise<any> => {
  const h = jwt ? {
    ...headers, 
    Authorization: `Bearer ${jwt}`
  } : headers;
  return new Promise((res, rej) => {
    fetch(url, {
      method: 'DELETE',
      headers: h,
    })
    .then(() => res(null))
    .catch((error) => rej(error));
  });
};
