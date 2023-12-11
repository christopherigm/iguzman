import { APIGet } from 'src/api/communicator';
import rebuildData from 'src/modules/utils/json-api-rebuild';

const versionCheckURL = 'pages/?fields[Page]=version';
const fullURL = 'pages/?include=address,address.city,address.city.state';

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

const fetchData = ( cacheVersion: number ): Promise<any> => {
  return new Promise((res, rej) => {
    getData( versionCheckURL )
      .then((d: any) => {
        const response = { ...d };
        response.data = response.data[0];
        const version = response.data.attributes.version;
        if ( cacheVersion && cacheVersion === version ) return res(null);
        getData( fullURL )
          .then((d: any) => {
            const response = { ...d };
            response.data = response.data[0];
            res(response);
          })
          .catch((error) => {
            rej(error);
          });
      })
      .catch((error) => {
        rej(error);
      });
  });
};

export default fetchData;
