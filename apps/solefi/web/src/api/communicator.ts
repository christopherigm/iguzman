// import https from 'https';
import axios from 'axios';
import EnvironmentVariables from 'src/constants/EnvironmentVariables';

const sc = EnvironmentVariables.getInstance();
const instance = axios.create({
  // httpsAgent: new https.Agent({
  //   rejectUnauthorized: false
  // })
});

export const APIGet = ( endpoint: string ): Promise<any> => {
  const url = `${sc.apiBaseUrl}${endpoint}`;
  return new Promise((res, rej) => {
    instance.get(url)
      .then((response) => {
        return res(response.data);
      })
      .catch((error) => {
        return rej(error);
      });
  });
};

export const APIPost = ( endpoint: string, data: any ): Promise<any> => {
  const url = `${sc.apiBaseUrl}${endpoint}`;
  return new Promise((res, rej) => {
    instance.post(url, data)
      .then((response) => {
        return res(response.data);
      })
      .catch((error) => {
        return rej(error);
      });
  });
};
