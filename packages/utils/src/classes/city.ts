import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';
import State from './state';
import API from '../api';
import BaseAPIClass from './base-class';

export default class City extends BaseAPIClass {
  public static instance: City;
  public type: string = 'City';
  public attributes: CityAttributes = new CityAttributes();
  public relationships: CityRelationships = new CityRelationships();

  public static getInstance(): City {
    return City.instance || new City();
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
    this.relationships.setRelationshipsFromPlainObject(object);
  }

  public getPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
      relationships: this.relationships.getPlainRelationships(),
    };
  }

  public save(): Promise<void> {
    return new Promise((res, rej) => {
      API.CreateCity({
        URLBase: this.URLBase,
        name: this.attributes.name,
        state: this.relationships.state.data.id,
      })
        .then((data) => {
          if (data.errors && data.errors.length) {
            return rej(data.errors);
          }
          this.id = Number(data?.id ?? this.id);
          return res();
        })
        .catch((e) => rej(e));
    });
  }

  public GetCitiesByStateID(stateID: number): Promise<{ data: Array<City> }> {
    return new Promise((res, rej) => {
      API.GetCitiesByStateID({
        URLBase: this.URLBase,
        stateID: Number(stateID),
      })
        .then((response) => {
          if (response.errors && response.errors.length) {
            return rej(response.errors);
          }
          res(response);
        })
        .catch((e) => rej(e));
    });
  }
}

class CityAttributes extends CommonFields {
  private _name: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.name = object.attributes.name ?? this.name;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.name && {
        name: this.name,
      }),
    };
  }

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

  public setRelationshipsFromPlainObject(object: any) {
    if (object.relationships) {
      if (object.relationships.state?.data) {
        this.state.data.setDataFromPlainObject(object.relationships.state.data);
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.state.data.id && {
        state: {
          data: this.state.data.getPlainObject(),
        },
      }),
    };
  }

  public get state() {
    return this._state.value;
  }
  public set state(value) {
    this._state.value = value;
  }
}

export const city = signal<City>(City.getInstance()).value;
