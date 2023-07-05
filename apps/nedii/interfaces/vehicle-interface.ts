import type {BasePictureAttributesInterface} from 'utils';
import type {StandInterface} from 'interfaces/stand-interface';

interface VehicleClassificationAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
};
export interface VehicleClassificationInterface {
  id: number;
  type: 'VehicleClassification';
  attributes: VehicleClassificationAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
  }
};

export interface VehicleFeatureInterface {
  id: number;
  type: 'VehicleFeature';
  attributes: {
    name: string;
  };
};

export interface VehiclePictureInterface extends BasePictureAttributesInterface {
  id: number;
  type: 'VehiclePicture';
  relationships: {
    stand: {
      data: StandInterface;
    };
    vehicle: {
      data: VehicleInterface;
    };
  };
};

export interface VehicleMakeInterface extends BasePictureAttributesInterface  {
  id: number;
  type: 'VehicleMake';
};

export interface VehicleModelInterface extends BasePictureAttributesInterface  {
  id: number;
  type: 'VehicleModel';
  relationships: {
    make: {
      data: VehicleMakeInterface;
    };
  };
};

interface VehicleAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
  state: 'new' | 'like-new' | 'used';
  year: number;
  doors: number;
  area: number;
  diesel: boolean;
  electric: boolean;
  automatic: boolean;
  four_wd: boolean;
  all_wd: boolean;
  publish_on_the_wall: boolean;
  price: number;
  discount: number;
  final_price: number;
  short_description: string;
  video_link: string;
  support_email: string;
  support_info: string;
  support_phone: string;
  warranty_days: number;
  times_selled: number;
  views: number;
};
export interface VehicleInterface {
  id: number;
  type: 'Vehicle';
  attributes: VehicleAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
    classification: {
      data: VehicleClassificationInterface;
    };
    model: {
      data: VehicleModelInterface;
    };
    features: {
      data: Array<VehicleFeatureInterface>;
    };
    vehicle_pictures: {
      data: Array<VehiclePictureInterface>;
    };
    related: {
      data: Array<VehicleInterface>;
    };
  };
};


