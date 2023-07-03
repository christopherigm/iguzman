export type CountryInterface = {
  id: number;
  type: 'Country';
  attributes: {
    name: string;
    code: string;
    phone_code: string;
    img_flag: string;
  }
};

export type StateInterface = {
  id: number;
  type: 'State';
  attributes: {
    name: string;
  };
  relationships: {
    country: {
      data: CountryInterface
    }
  }
};

export type CityInterface = {
  id: number;
  type: 'City';
  attributes: {
    name: string;
  };
  relationships: {
    state: {
      data: StateInterface
    }
  }
};

export interface BasePictureAttributesInterface {
  name: string;
  description: string;
  href: string;
  full_size: string;
  img_picture: string;
};

export type NediiPlanInterface = {
  id: number;
  type: 'NediiPlan';
  attributes: {
    name: string;
    unlimited_items: boolean;
    number_of_items: number;
    advertising_days: number;
    stand_enabled: boolean;
    digital_card: boolean;
    billed_monthly: boolean;
    exposure: 'basic' | 'medium' | 'high' | 'full';
    price: number;
  };
  relationships: {
    state: {
      data: StateInterface
    }
  }
};
