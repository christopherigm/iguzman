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
    const pageSize = 'page[size]=10&';
    const sorting = 'sort=modified&';
    const filtering = 'filter[enabled]=true&';
    let include = 'include=plant_type,plant_controller,';
    include += 'plant_controller.plant_controller_type,';
    include += 'plant_controller.city,';
    include += 'plant_controller.city.state,';
    include += 'plant_controller.city.state.country&';
    let fields = 'fields[Plant]=name,slug,img_picture,last_measurement,plant_type,plant_controller&';
    fields += 'fields[PLantController]=cpu_temperature,plant_controller_type&';
    fields += 'fields[PLantControllerType]=min_cpu_temperature,max_cpu_temperature,city&';
    fields += 'fields[City]=name,state&';
    fields += 'fields[State]=name,country&';
    fields += 'fields[Country]=name&';
    const parameters = pageSize + sorting + filtering + include + fields;
    const url = `${URLBase}/v1/plants/?${parameters}`;

    API.Get({url})
      .then(response => {
        res(RebuildData(response).data)
      })
      .catch(error => rej(error));
  });
};

export default GetMainPagePlants;
