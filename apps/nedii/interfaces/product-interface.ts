import type {BasePictureAttributesInterface} from 'utils';
import type {StandInterface} from 'interfaces/stand-interface';

interface ProductClassificationAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
};
export interface ProductClassificationInterface {
  id: number;
  type: 'ProductClassification';
  attributes: ProductClassificationAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
  }
};

interface ProductDeliveryTypeAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  icon: string;
};
export interface ProductDeliveryTypeInterface {
  id: number;
  type: 'ProductDeliveryType';
  attributes: ProductDeliveryTypeAttributesInterface;
};

export interface ProductFeatureOptionInterface {
  id: number;
  type: 'ProductFeatureOption';
  attributes: {
    name: string;
  };
  relationships: {
    feature: {
      data: ProductFeatureInterface;
    };
  };
};
export interface ProductFeatureInterface {
  id: number;
  type: 'ProductFeature';
  attributes: {
    name: string;
  };
  relationships: {
    stand: {
      data: StandInterface;
    };
    options: {
      data: Array<ProductFeatureOptionInterface>;
    };
  };
};

export interface ProductPictureInterface extends BasePictureAttributesInterface {
  id: number;
  type: 'ProductPicture';
  relationships: {
    stand: {
      data: StandInterface;
    };
    product: {
      data: ProductInterface;
    };
  };
};

interface ProductAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
  publish_on_the_wall: boolean;
  state: 'new' | 'like-new' | 'used';
  price: number;
  discount: number;
  final_price: number;
  brand: string;
  short_description: string;
  unlimited_stock: boolean;
  stock: number;
  shipping_cost: number;
  video_link: string;
  support_email: string;
  support_info: string;
  support_phone: string;
  warranty_days: number;
  times_selled: number;
  views: number;
};
export interface ProductInterface {
  id: number;
  type: 'Product';
  attributes: ProductAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
    classification: {
      data: ProductClassificationInterface;
    };
    delivery_type: {
      data: ProductDeliveryTypeInterface;
    };
    features: {
      data: Array<ProductFeatureInterface>;
    };
    product_pictures: {
      data: Array<ProductPictureInterface>;
    };
    related: {
      data: Array<ProductInterface>;
    };
  };
};


