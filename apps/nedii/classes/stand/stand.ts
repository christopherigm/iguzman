import { Signal, signal } from '@preact-signals/safe-react';
import { City } from '@repo/utils';
import NediiPlan from 'classes/nedii-plan';
import User from 'classes/user';
import Group from 'classes/group';
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

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.name = object.attributes.name ?? this.attributes.name;
    this.attributes.slug = object.attributes.slug ?? this.attributes.slug;
    this.attributes.img_logo =
      object.attributes.img_logo ?? this.attributes.img_logo;
    this.attributes.img_cover =
      object.attributes.img_cover ?? this.attributes.img_cover;
    this.attributes.average_rating =
      object.attributes.average_rating ?? this.attributes.average_rating;
    this.attributes.products_max_price =
      object.attributes.products_max_price ??
      this.attributes.products_max_price;
    this.attributes.meals_max_price =
      object.attributes.meals_max_price ?? this.attributes.meals_max_price;
    this.attributes.services_max_price =
      object.attributes.services_max_price ??
      this.attributes.services_max_price;
    this.attributes.vehicles_max_price =
      object.attributes.vehicles_max_price ??
      this.attributes.vehicles_max_price;
    this.attributes.real_state_max_price =
      object.attributes.real_state_max_price ??
      this.attributes.real_state_max_price;
    // Relationships
    if (object.relationships?.city?.data) {
      this.relationships.city.data.setAttributesFromPlainObject(
        object.relationships?.city?.data
      );
    }
    if (object.relationships?.group?.data) {
      this.relationships.group.data.setAttributesFromPlainObject(
        object.relationships?.group?.data
      );
    }
    if (object.relationships?.expo?.data) {
      this.relationships.expo.data.setAttributesFromPlainObject(
        object.relationships?.expo?.data
      );
    }
    this.relationships.owner = {
      data: User.getInstance(),
    };
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
  public _plan: Signal<{ data: NediiPlan }> = signal({
    data: NediiPlan.getInstance(),
  });
  public _owner: Signal<{ data: User } | null> = signal(null);
  public _group: Signal<{ data: Group }> = signal({
    data: Group.getInstance(),
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

  public get group() {
    return this._group.value;
  }
  public set group(value) {
    this._group.value = value;
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

  public get phone() {
    return '248 111';
    // return this._id.value;
  }
  public set phone(value) {
    // this._id.value = value;
  }
}

export const stand = signal<Stand>(Stand.getInstance()).value;
