import PlantInterface from './plant-interface';

export default interface MeasurementInterface {
  id: number,
  attributes: {
    created: string;
    modified: string;
    soil_moisture: number;
    ldr: number;
    temperature: number;
    humidity: number;
    is_day: boolean;
    cpu_temperature: number;
  }
  relationships: {
    plant: {
      data: PlantInterface
    }
  }
};
