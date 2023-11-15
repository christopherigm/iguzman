import { Signal, signal } from '@preact/signals-react';
import NediiPlan from 'classes/nedii-plans';
import User from 'classes/user';
import { City } from 'utils';
import StandAttributes from './stand-attributes';

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
  public set id(value: number) {
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
}

export const stand = signal<Stand>(Stand.getInstance()).value;
