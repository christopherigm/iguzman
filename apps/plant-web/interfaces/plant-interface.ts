export default interface PlantInterface {
  id: number,
  attributes: {
    created: string;
    modified: string;
    name: string;
    slug: string;
    img_picture: string;
    last_measurement: {
      soil_moisture: number;
      ldr: number;
      temperature: number;
      humidity: number;
      is_day: boolean;
      cpu_temperature: number;
      created?: string;
    }
  }
  relationships: {
    plant_type: {
      data: {
        attributes: {
          name: string;
          slug: string;
          min_soil_humidity: number;
          min_ambient_temperature: number;
          max_ambient_temperature: number;
          min_ambient_humidity: number;
          min_light_value: number;
          max_light_value: number;
          hours_of_direct_light: number;
          img_picture: string;
        }
      }
    }
  }
};
