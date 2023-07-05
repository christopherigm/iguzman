import type {
  BaseUser,
  BaseUserAttributes,
  CityInterface,
  UserAddressAttributesInterface,
} from 'utils';
import type {StandInterface} from 'interfaces/stand-interface';
import {
  MealInterface,
  MealAddonInterface,
} from 'interfaces/meal-interface';
import { ProductInterface } from 'interfaces/product-interface';
import { ServiceInterface } from 'interfaces/service-interface';
import { RealEstateInterface } from 'interfaces/real-estate-interface';
import { VehicleInterface } from 'interfaces/vehicle-interface';

interface attributes extends BaseUserAttributes {
  is_seller: boolean;
  newsletter: boolean;
  promotions: boolean;
  biography: string;
  owner_position: string;
  owner_position_description: string;
  owner_phone: string;
  owner_office_phone: string;
  owner_email: string;
  owner_whatsapp: string;
  owner_address: string;
};
export default interface UserInterface extends BaseUser{
  attributes: attributes
};

export interface UserAddressInterface extends UserAddressAttributesInterface {
  id: number;
  type: 'UserAddress';
  attributes: UserAddressAttributesInterface;
  relationships: {
    city: {
      data: CityInterface
    };
    user: {
      data: UserInterface
    }
  }
};

export interface UserAbstractBuyableItemIterface {
  id: number;
  attributes: {
    backup_name: string;
    backup_user_name: string;
    backup_final_price: number;
    quantity: number;
  };
  relationships: {
    user: {
      data: UserInterface;
    };
    city: {
      data: CityInterface;
    };
    product: {
      data: ProductInterface;
    };
    service: {
      data: ServiceInterface;
    };
    meal: {
      data: MealInterface;
    };
    meal_addons: {
      data: Array<MealAddonInterface>;
    };
    real_estate: {
      data: RealEstateInterface;
    };
    vehicle: {
      data: VehicleInterface;
    };
  }
};

export interface UserCartBuyableItemInterface extends UserAbstractBuyableItemIterface {
  type: 'UserCartBuyableItem';
  attributes: {
    backup_name: string;
    backup_user_name: string;
    backup_final_price: number;
    quantity: number;
  };
};

export interface UserFavoriteBuyableItemInterface extends UserAbstractBuyableItemIterface {
  id: number;
  type: 'UserFavoriteBuyableItem';
};

export interface UserFavoriteStandInterface {
  id: number;
  type: 'UserFavoriteStand';
  relationships: {
    user: {
      data: UserInterface
    };
    stand: {
      data: StandInterface
    };
  }
};

export interface UserOrderBuyableItemInterface {
  id: number;
  type: 'UserOrderBuyableItem';
  attributes: {
    quantity: number;
  };
  relationships: {
    user: {
      data: UserInterface
    };
  }
};

export interface UserOrderInterface {
  id: number;
  type: 'UserOrder';
  attributes: {
    quantity: number;
    address: string;
    receptor_name: string;
    phone: string;
    reference: string;
    broker_id: string;
    backup_user_name: string;
  };
  relationships: {
    user: {
      data : UserInterface
    };
    order_items: {
      data: Array<UserOrderBuyableItemInterface>
    }
  }
};
