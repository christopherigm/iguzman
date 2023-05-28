import {
  API,
  RebuildData
} from 'utils';

type Props = {
  URLBase: string;
  slug: string;
};

const GetPlantBySlug = ({
    URLBase,
    slug
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const pageSize = `filter[slug]=${slug}&`;
    const include = 'include=plant_type';
    const parameters = pageSize + include;
    const url = `${URLBase}/v1/plants/?${parameters}`;
    API.Get({url})
      .then(response => {
        if (!response.data.length) {
          return rej(new Error('404'))
        }
        res(RebuildData(response).data[0])
      })
      .catch(error => rej(error));
  });
};

export default GetPlantBySlug;
