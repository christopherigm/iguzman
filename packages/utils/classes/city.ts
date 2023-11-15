import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';
import State from './state';

export default class City extends CommonFields {
  public static instance: City;
  protected type: string = 'Stand';
  private _id: Signal<number> = signal(0);
  public attributes: CityAttributes = new CityAttributes();
  public relationships: CityRelationships = new CityRelationships();

  public static getInstance(): City {
    return City.instance || new City();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value: number) {
    this._id.value = value;
  }
}

class CityAttributes {
  private _name: Signal<string> = signal('');

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }
}

class CityRelationships {
  public _state: Signal<{ data: State }> = signal({
    data: State.getInstance(),
  });

  public get state() {
    return this._state.value;
  }
  public set state(value) {
    this._state.value = value;
  }
}
