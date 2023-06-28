import PlantInterface from './plant-interface';

export default interface MeasurementInterface {
  id: number;
  attributes: {
    created: string;
    modified: string;
    initial_measurement: boolean;
    ldr: number;
    soil_moisture: number;
    temperature: number;
    humidity: number;
    is_day: boolean;
    cpu_temperature: number;
    ram_allocated: number;
    storage_allocated: number;
  }
  relationships: {
    plant: {
      data: PlantInterface
    }
  }
};
