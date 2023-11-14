import type {
  NediiPlanInterface,
} from 'interfaces/common-interfaces';
import type {
  CityInterface,
  BasePictureAttributesInterface,
} from 'utils';
import UserInterface from 'interfaces/user-interface';
import { MealInterface } from 'interfaces/meal-interface';
import { ProductInterface } from 'interfaces/product-interface';
import { ServiceInterface } from 'interfaces/service-interface';
import { RealEstateInterface } from 'interfaces/real-estate-interface';
import { VehicleInterface } from 'interfaces/vehicle-interface';

export interface StandBookingQuestionOptionInterface {
  id: number;
  type: 'StandBookingQuestionOption';
  attributes: {
    value: string;
  }
};

export interface StandBookingQuestionInterface {
  id: number;
  type: 'StandBookingQuestion';
  attributes: {
    name: string;
    open_answer: boolean;
  };
  relationships: {
    options: {
      data: Array<StandBookingQuestionOptionInterface>
    }
  }
};

export interface StandNewInterface {
  id: number;
  type: 'StandNew';
  attributes: {
    name: string;
    slug: string;
  };
  relationships: {
    stand: {
      data: StandInterface
    }
  }
};

export interface StandPhoneInterface {
  id: number;
  type: 'StandPhone';
  attributes: {
    phone: string;
  };
  relationships: {
    stand: {
      data: StandInterface
    }
  }
};

export interface StandPictureInterface {
  id: number;
  type: 'StandPicture';
  relationships: {
    stand: {
      data: StandInterface
    }
  }
};

interface StandPromotionAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
};
export interface StandPromotionInterface {
  id: number;
  type: 'StandPromotion';
  attributes: StandPromotionAttributesInterface
  relationships: {
    stand: {
      data: StandInterface
    };
    product: {
      data: ProductInterface
    };
    service: {
      data: ServiceInterface
    };
    meal: {
      data: MealInterface
    };
    real_estate: {
      data: RealEstateInterface
    };
    vehicle: {
      data: VehicleInterface
    }
  }
};

export interface StandRatingInterface {
  id: number;
  type: 'StandRating';
  attributes: {
    rating: number;
    description: string;
  };
  relationships: {
    stand: {
      data: StandInterface
    };
    author: {
      data: UserInterface
    }
  }
};

export interface SurveyQuestionInterface {
  id: number;
  type: 'SurveyQuestion';
  attributes: {
    name: string;
  }
};

export interface VideoLinkInterface {
  id: number;
  type: 'VideoLink';
  attributes: {
    name: string;
    link: string;
  };
  relationships: {
    stand: {
      data: StandInterface
    };
  }
};

interface ExpoAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  is_real: boolean;
  email: string;
  slug: string;
};
export interface ExpoInterface {
  id: number;
  type: 'Expo';
  attributes: ExpoAttributesInterface;
  relationships: {
    groups: {
      data: Array<GroupInterface>
    };
  };
};

interface GroupAttributesInterface extends BasePictureAttributesInterface {
  name: string;
  slug: string;
  icon: string;
  color: string;
};
export interface GroupInterface {
  id: number;
  type: 'Group';
  attributes: GroupAttributesInterface;
};

export interface StandInterface {
  id: number;
  type: 'Stand';
  attributes: {
    // restaurant: boolean;
    // name: string;
    // slug: string;
    // slogan: string;
    // bar_code: string;
    // description: string;
    // short_description: string;
    // img_logo: string;
    // img_cover: string;
    // contact_email: string;
    // support_email: string;

    // always_open: boolean;
    // monday_open: string;
    // monday_close: string;
    // tuesday_open: string;
    // tuesday_close: string;
    // wednesday_open: string;
    // wednesday_close: string;
    // thursday_open: string;
    // thursday_close: string;
    // friday_open: string;
    // friday_close: string;
    // saturday_open: string;
    // saturday_close: string;
    // sunday_open: string;
    // sunday_close: string;
    // booking_active: boolean;
    // booking_fee: number;
    // booking_email: string;
    
    // zip_code: string;
    // address: string;
    // about: string;
    // mission: string;
    // vision: string;

    // web_link: string;
    // facebook_link: string;
    // twitter_link: string;
    // instagram_link: string;
    // linkedin_link: string;
    // google_link: string;
    // youtube_link: string;
    // average_rating: number;
    // products_max_price: number;
    // meals_max_price: number;
    // services_max_price: number;
    // vehicles_max_price: number;
    // real_state_max_price: number;
  };
  relationships: {
    plan: {
      data: NediiPlanInterface;
    };
    owner: {
      data: UserInterface;
    };
    expo: {
      data: ExpoInterface;
    };
    group: {
      data: GroupInterface;
    };
    panorama: {
      data: Array<StandPictureInterface>;
    };
    video_links: {
      data: Array<VideoLinkInterface>;
    };
    pictures: {
      data: Array<StandPictureInterface>;
    };
    phones: {
      data: Array<StandPhoneInterface>;
    };
    city: {
      data: CityInterface;
    };
    stand_booking_questions: {
      data: Array<StandBookingQuestionInterface>;
    };
    stand_news: {
      data: Array<StandNewInterface>;
    };
    promotions: {
      data: Array<StandPromotionInterface>;
    };
    survey_questions: {
      data: Array<SurveyQuestionInterface>;
    };
    ratings: {
      data: Array<StandRatingInterface>;
    };
    highlighted_products: {
      data: Array<ProductInterface>;
    };
    highlighted_services: {
      data: Array<ServiceInterface>;
    };
    highlighted_meals: {
      data: Array<MealInterface>;
    };
    highlighted_real_estates: {
      data: Array<RealEstateInterface>;
    };
    highlighted_vehicles: {
      data: Array<VehicleInterface>;
    };
  }
};
