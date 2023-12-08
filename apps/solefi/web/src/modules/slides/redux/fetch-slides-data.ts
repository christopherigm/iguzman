import { APIGet } from 'src/api/communicator';
import rebuildData from 'src/modules/utils/json-api-rebuild';

const dataId = 'slides';
const fullURL = `info-grids/?filter[name]=${dataId}&include=items`;

const getData = ( url: string ): Promise<any> => {
  return new Promise((res, rej) => {
    APIGet( url )
      .then((d: any) => {
        res(rebuildData(d));
      })
      .catch((error) => {
        rej(error);
      });
  });
};

const fetchData = (): Promise<any> => {
  return new Promise((res, rej) => {
    getData( fullURL )
      .then((d: any) => {
        const response = { ...d };
        response.data = response.data[0];
        res(response);
      })
      .catch((error) => {
        rej(error);
      });
  });
};

export default fetchData;
