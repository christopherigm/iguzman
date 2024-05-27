import { Signal, signal } from '@preact-signals/safe-react';
import { City, API, removeImagesForAPICall } from '@repo/utils';
import NediiPlan from 'classes/nedii-plan';
import User from 'classes/user';
import Category from 'classes/category';
import Expo from 'classes/expo';
import StandAttributes from './stand-attributes';
import StandBookingQuestion from 'classes/stand/stand-booking-question';
import StandNew from 'classes/stand/stand-new';
import StandPromotion from 'classes/stand/stand-promotion';
import SurveyQuestion from 'classes/stand/stand-survey-question';
import StandRating from 'classes/stand/stand-rating';
import StandPicture from 'classes/stand/stand-picture';
import StandPhone from 'classes/stand/stand-phone';

export default class Stand {
  public static instance: Stand;
  protected type: string = 'Stand';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _access: Signal<string> = signal('');
  public attributes: StandAttributes = new StandAttributes();
  public relationships: StandRelationships = new StandRelationships();

  public static getInstance(): Stand {
    return Stand.instance || new Stand();
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
    // Relationships
    if (object.relationships?.city?.data) {
      this.relationships.city.data.setAttributesFromPlainObject(
        object.relationships?.city?.data
      );
    }
    if (object.relationships?.category?.data) {
      this.relationships.category.data.setAttributesFromPlainObject(
        object.relationships?.category?.data
      );
    }
    if (object.relationships?.expo?.data) {
      this.relationships.expo.data.setAttributesFromPlainObject(
        object.relationships?.expo?.data
      );
    }
    if (object.relationships?.phones?.data) {
      object.relationships.phones.data.map((i: any) => {
        const newPhone = new StandPhone();
        newPhone.setDataFromPlainObject(i);
        this.relationships.phones.data.push(newPhone);
      });
      this.relationships.phones.data = [...this.relationships.phones.data];
    }
    this.relationships.owner = {
      data: User.getInstance(),
    };
  }

  public getPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.attributes.getStandPlainAttributes(),
      relationships: this.relationships.getStandRelationshipsPlainAttributes(
        this.id
      ),
    };
  }

  public getMinimumPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
    };
  }

  public save(): Promise<void> {
    return new Promise((res, rej) => {
      const url = `${this.URLBase}/v1/stands/${this.id ? this.id + '/' : ''}`;
      const data = {
        url,
        jwt: this.access,
        data: this.getPlainObject(),
      };
      removeImagesForAPICall(data.data.attributes);
      console.log('saveStand:', data);
      if (this.id) {
        API.Patch(data)
          .then((response) => {
            console.log('response:', response);
            res(response);
          })
          .catch((error) => rej(error));
      } else {
        API.Post(data)
          .then((response) => {
            console.log('response:', response);
            res(response);
          })
          .catch((error) => rej(error));
      }
    });
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }

  public get URLBase() {
    return this._URLBase.value;
  }
  public set URLBase(value) {
    this._URLBase.value = value;
  }

  public get access() {
    return this._access.value;
  }
  public set access(value) {
    this._access.value = value;
  }
}

class StandRelationships {
  public getStandRelationshipsPlainAttributes(id = 0): Object {
    return {
      plan: {
        data: this.plan.data.id
          ? this.plan.data.getPlainObject()
          : {
              id: 1,
              type: 'NediiPlan',
            },
      },
      owner: {
        data: this.owner?.data.getPlainObject(),
      },
      category: {
        data: this.category.data.getPlainObject(),
      },
      expo: {
        data: this.expo.data.getPlainObject(),
      },
      ...(this.city.data.id && {
        city: {
          data: this.city.data.getPlainObject(),
        },
      }),

      phones: {
        data: id ? this.phones.data.map((i) => i.getPlainObject()) : [],
      },
      pictures: {
        data: id ? this.pictures.data.map((i) => i.getPlainObject()) : [],
      },
      highlighted_meals: {
        data: [],
      },
      highlighted_products: {
        data: [],
      },
      highlighted_real_estates: {
        data: [],
      },
      highlighted_services: {
        data: [],
      },
      highlighted_vehicles: {
        data: [],
      },
      panorama: {
        data: [],
      },
      promotions: {
        data: [],
      },
      ratings: {
        data: [],
      },
      stand_booking_questions: {
        data: [],
      },
      stand_news: {
        data: [],
      },
      survey_questions: {
        data: [],
      },
      video_links: {
        data: [],
      },
    };
  }

  public _plan: Signal<{ data: NediiPlan }> = signal({
    data: NediiPlan.getInstance(),
  });
  public _owner: Signal<{ data: User } | null> = signal(null);
  public _category: Signal<{ data: Category }> = signal({
    data: Category.getInstance(),
  });
  public _expo: Signal<{ data: Expo }> = signal({
    data: Expo.getInstance(),
  });
  public _city: Signal<{ data: City }> = signal({
    data: City.getInstance(),
  });
  public _phones: Signal<{ data: Array<StandPhone> }> = signal({
    data: [],
  });
  public _pictures: Signal<{ data: Array<StandPicture> }> = signal({
    data: [],
  });
  public _stand_booking_questions: Signal<{
    data: Array<StandBookingQuestion>;
  }> = signal({
    data: [],
  });
  public _stand_news: Signal<{ data: Array<StandNew> }> = signal({
    data: [],
  });
  public _promotions: Signal<{ data: Array<StandPromotion> }> = signal({
    data: [],
  });
  public _survey_questions: Signal<{ data: Array<SurveyQuestion> }> = signal({
    data: [],
  });
  public _ratings: Signal<{ data: Array<StandRating> }> = signal({
    data: [],
  });

  public get plan() {
    return this._plan.value;
  }
  public set plan(value) {
    this._plan.value = value;
  }

  public get owner() {
    return this._owner.value;
  }
  public set owner(value) {
    this._owner.value = value;
  }

  public get category() {
    return this._category.value;
  }
  public set category(value) {
    this._category.value = value;
  }

  public get expo() {
    return this._expo.value;
  }
  public set expo(value) {
    this._expo.value = value;
  }

  public get pictures() {
    return this._pictures.value;
  }
  public set pictures(value) {
    this._pictures.value = value;
  }

  public get city() {
    return this._city.value;
  }
  public set city(value) {
    this._city.value = value;
  }

  public get phones() {
    return this._phones.value;
  }
  public set phones(value) {
    this._phones.value = value;
  }

  public get stand_booking_questions() {
    return this._stand_booking_questions.value;
  }
  public set stand_booking_questions(value) {
    this._stand_booking_questions.value = value;
  }

  public get stand_news() {
    return this._stand_news.value;
  }
  public set stand_news(value) {
    this._stand_news.value = value;
  }

  public get promotions() {
    return this._promotions.value;
  }
  public set promotions(value) {
    this._promotions.value = value;
  }

  public get survey_questions() {
    return this._survey_questions.value;
  }
  public set survey_questions(value) {
    this._survey_questions.value = value;
  }

  public get ratings() {
    return this._ratings.value;
  }
  public set ratings(value) {
    this._ratings.value = value;
  }
}

export const stand = signal<Stand>(Stand.getInstance()).value;
