import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';
import Country from './country';
import API from '../api';
import BaseAPIClass from './base-class';

export default class State extends BaseAPIClass {
  public static instance: State;
  public type: string = 'State';
  public endpoint: string = '/v1/states/';
  public attributes: StateAttributes = new StateAttributes();
  public relationships: StateRelationships = new StateRelationships();

  public static getInstance(): State {
    return State.instance || new State();
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
      API.CreateState({
        URLBase: this.URLBase,
        name: this.attributes.name,
        country: this.relationships.country.data.id,
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

  public GetStatesByCountryID(
    countryID: number
  ): Promise<{ data: Array<State> }> {
    return new Promise((res, rej) => {
      API.GetStatesByCountryID({
        URLBase: this.URLBase,
        countryID: Number(countryID),
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

class StateAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _code: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.name = object.attributes.name ?? this.name;
      this.code = object.attributes.code ?? this.code;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.name && {
        name: this.name,
      }),
      ...(this.code && {
        code: this.code,
      }),
    };
  }

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get code() {
    return this._code.value;
  }
  public set code(value) {
    this._code.value = value;
  }
}

class StateRelationships {
  public _country: Signal<{ data: Country }> = signal({
    data: Country.getInstance(),
  });

  public setRelationshipsFromPlainObject(object: any) {
    if (object.relationships) {
      if (object.relationships.country?.data) {
        this.country.data.setDataFromPlainObject(
          object.relationships.country.data
        );
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.country.data.id && {
        state: {
          data: this.country.data.getPlainObject(),
        },
      }),
    };
  }

  public get country() {
    return this._country.value;
  }
  public set country(value) {
    this._country.value = value;
  }
}
