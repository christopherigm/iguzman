import type {BasePictureAttributesInterface} from 'interfaces/common-interfaces';
import type {StandInterface} from 'interfaces/stand-interface';

interface MealClassificationAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
  img_icon: string;
};
export interface MealClassificationInterface {
  id: number;
  type: 'MealClassification';
  attributes: MealClassificationAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
  }
};

interface MealAddonAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  quantity: string;
  price: number;
};
export interface MealAddonInterface {
  id: number;
  type: 'MealAddon';
  attributes: MealAddonAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
  }
};

interface MealPictureAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  quantity: string;
  price: number;
};
export interface MealPictureInterface {
  id: number;
  type: 'MealPicture';
  attributes: MealPictureAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
    meal: {
      data: MealInterface;
    };
  }
};

interface MealAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
  publish_on_the_wall: boolean;
  stock: number;
  is_breakfast: boolean;
  is_meal: boolean;
  is_dinner: boolean;
  short_description: string;
  description: string;
  price: number;
  discount: number;
  final_price: number;
  video_link: string;
  times_selled: number;
  views: number;
};
export interface MealInterface {
  id: number;
  type: 'Meal';
  attributes: MealAttributesInterface;
  relationships: {
    stand: {
      data: StandInterface;
    };
    classification: {
      data: MealClassificationInterface;
    };
    meal_addons: {
      data: MealAddonInterface;
    };
    meal_pictures: {
      data: MealPictureInterface;
    };
  }
};
