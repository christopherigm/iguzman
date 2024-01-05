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
    let include = 'include=plant_type,plant_controller,';
    include += 'plant_controller.plant_controller_type,';
    include += 'plant_controller.city,';
    include += 'plant_controller.city.state,';
    include += 'plant_controller.city.state.country&';
    let fields = 'fields[City]=name,state&';
    fields += 'fields[State]=name,country&';
    fields += 'fields[Country]=name&';
    const parameters = pageSize + include + fields;
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
