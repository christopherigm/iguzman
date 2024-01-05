export type JSONAPICommonArrayResponse = {
  links: {
    first: string;
    last: string;
    next: null | string;
    prev: null | string;
  };
  meta: {
    pagination: {
      page: number;
      pages: number;
      count: number;
    };
  };
};

export type CountryInterface = {
  id: number;
  type: 'Country';
  attributes: {
    name: string;
    code: string;
    phone_code: string;
    img_flag: string;
  };
};

export type StateInterface = {
  id: number;
  type: 'State';
  attributes: {
    name: string;
  };
  relationships: {
    country: {
      data: CountryInterface | null;
    };
  };
};

export type CityInterface = {
  id: number;
  type: 'City';
  attributes: {
    name: string;
  };
  relationships: {
    state: {
      data: StateInterface | null;
    };
  };
};

export interface BasePictureAttributesInterface {
  name: string;
  description: string;
  href: string;
  full_size: string;
  img_picture: string;
}
