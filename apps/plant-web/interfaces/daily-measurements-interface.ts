import PlantInterface from './plant-interface';

export default interface DailyMeasurementsInterface {
  id: number;
  attributes: {
    created: string;
    modified: string;
    min_ldr: string;
    max_ldr: string;
    average_ldr: string;
    min_soil_moisture: string;
    max_soil_moisture: string;
    average_soil_moisture: string;
    min_temperature: string;
    max_temperature: string;
    average_temperature: string;
    min_humidity: string;
    max_humidity: string;
    average_humidity: string;
    min_cpu_temperature: string;
    max_cpu_temperature: string;
    average_cpu_temperature: string;
    initial_ram_allocated: string;
    final_ram_allocated: string;
    initial_storage_allocated: string;
    final_storage_allocated: string;
    hours_of_direct_light: string;
    times_the_pump_was_triggered: number;
  }
  relationships: {
    plant: {
      data: PlantInterface
    }
  }
};
