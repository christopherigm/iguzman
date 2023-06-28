export type CountryInterface = {
  id: number,
  attributes: {
    name: string;
    code: string;
    phone_code: string;
    img_flag: string;
  }
};

export type StateInterface = {
  id: number,
  attributes: {
    name: string;
  },
  relationships: {
    country: {
      data: CountryInterface
    }
  }
};

export type CityInterface = {
  id: number,
  attributes: {
    name: string;
  },
  relationships: {
    state: {
      data: StateInterface
    }
  }
};

export type PLantControllerTypeInterface = {
  id: number,
  attributes: {
    name: string;
    slug: string;
    min_cpu_temperature: number;
    max_cpu_temperature: number;
    total_ram_capacity: number;
    total_storage_capacity: number;
    img_picture: string;
  }
};

export type PLantControllerInterface = {
  id: number,
  attributes: {
    name: string;
    slug: string;
    zip_code: string;
    cpu_temperature: number;
    ram_allocated: number;
    storage_allocated: number;
    img_picture: string;
  },
  relationships: {
    plant_controller_type: {
      data: PLantControllerTypeInterface
    },
    city: {
      data: CityInterface
    }
  }
};

export type PLantTypeInterface = {
  id: number,
  attributes: {
    name: string;
    slug: string;
    min_soil_humidity: number;
    max_soil_humidity: number;
    min_ambient_temperature: number;
    max_ambient_temperature: number;
    min_ambient_humidity: number;
    max_ambient_humidity: number;
    min_light_value: number;
    max_light_value: number;
    min_hours_of_direct_light: number;
    max_hours_of_direct_light: number;
    minutes_to_upload_sensor_data: number;
    img_picture: string;
  }
};

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
      computed_hours_of_direct_light: number;
      total_ram_capacity: number;
      ram_allocated: number;
      ram_free: number;
      total_storage_capacity: number;
      storage_allocated: number;
      storage_free: number;
      created: string;
    }
  },
  relationships: {
    plant_type: {
      data: PLantTypeInterface
    },
    plant_controller: {
      data: PLantControllerInterface
    }
  }
};
