import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';
import State from './state';

export default class City {
  public static instance: City;
  public type: string = 'City';
  private _id: Signal<number> = signal(0);
  public attributes: CityAttributes = new CityAttributes();
  public relationships: CityRelationships = new CityRelationships();

  public static getInstance(): City {
    return City.instance || new City();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.name = object.attributes?.name ?? this.attributes.name;
    // Relationships
    if (object.relationships?.state.data) {
      this.relationships.state.data.setAttributesFromPlainObject(
        object.relationships?.state?.data
      );
    }
  }

  public getPlainAttributes(): Object {
    return {
      name: this.attributes.name,
    };
  }

  public getPlainRelationships(): Object {
    return {
      state: this.relationships.state.data.getPlainAttributes(),
    };
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class CityAttributes extends CommonFields {
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
