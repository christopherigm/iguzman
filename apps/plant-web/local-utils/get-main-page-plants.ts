import {
  API,
  RebuildData
} from 'utils';

type Props = {
  URLBase: string;
};

const GetMainPagePlants = ({
    URLBase
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const pageSize = 'page[size]=100&';
    const sorting = 'sort=id&';
    const include = 'include=plant_type';
    const parameters = pageSize + sorting + include;
    const url = `${URLBase}/v1/plants/?${parameters}`;
    API.Get({url})
      .then(response => {
        res(RebuildData(response).data)
      })
      .catch(error => rej(error));
  });
};

export default GetMainPagePlants;
