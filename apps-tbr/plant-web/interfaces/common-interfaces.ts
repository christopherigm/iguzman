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
