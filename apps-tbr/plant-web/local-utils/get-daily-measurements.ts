import {
  API,
  RebuildData
} from 'utils';

type Props = {
  URLBase: string;
  plantID: number;
  pageSize?: number;
};

const GetDailyMeasurements = ({
    URLBase,
    plantID,
    pageSize = 10
  }: Props ): Promise<any> => {
  return new Promise((res, rej) => {
    const filters = `filter[plant]=${plantID}&`;
    const sorting = `sort=-created&`;
    const size = `page[size]=${pageSize}&`;
    let include = 'include=plant,plant.plant_type,plant.plant_controller,plant.plant_controller.plant_controller_type&';
    let fields = 'fields[Plant]=plant_type,plant_controller,plant_controller.plant_controller_type&';
    fields += 'fields[PlantType]=min_soil_humidity,max_soil_humidity,';
    fields += 'min_ambient_temperature,max_ambient_temperature,';
    fields += 'min_ambient_humidity,max_ambient_humidity,';
    fields += 'min_light_value,max_light_value,';
    fields += 'min_hours_of_direct_light,max_hours_of_direct_light&';
    fields += 'fields[PlantMicroController]=plant_controller_type&';
    fields += 'fields[PlantControllerType]=min_cpu_temperature,max_cpu_temperature&';
    const parameters = filters + sorting + size + include + fields;
    const url = `${URLBase}/v1/daily-measurements/?${parameters}`;
    API.Get({url})
      .then(response => {
        res(RebuildData(response).data)
      })
      .catch(error => rej(error));
  });
};

export default GetDailyMeasurements;
