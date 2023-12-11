import { Signal, signal } from '@preact/signals-react';
import { City } from 'utils';
import NediiPlan from 'classes/nedii-plans';
import User from 'classes/user';
import StandAttributes from './stand-attributes';
import StandBookingQuestion from 'classes/stand/stand-booking-question';
import StandNew from 'classes/stand/stand-new';
import StandPromotion from 'classes/stand/stand-promotion';
import SurveyQuestion from 'classes/stand/stand-survey-question';
import StandRating from 'classes/stand/stand-rating';

export default class Stand {
  public static instance: Stand;
  protected type: string = 'Stand';
  private _id: Signal<number> = signal(0);
  public attributes: StandAttributes = new StandAttributes();
  public relationships: StandRelationships = new StandRelationships();

  public static getInstance(): Stand {
    return Stand.instance || new Stand();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandRelationships {
  public _plan: Signal<{ data: NediiPlan }> = signal({
    data: NediiPlan.getInstance(),
  });
  public _owner: Signal<{ data: User }> = signal({
    data: User.getInstance(),
  });
  public _city: Signal<{ data: City }> = signal({
    data: City.getInstance(),
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

  public get city() {
    return this._city.value;
  }
  public set city(value) {
    this._city.value = value;
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
