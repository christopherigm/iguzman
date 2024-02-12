import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';
import Country from './country';

export default class State {
  public static instance: State;
  public type: string = 'State';
  private _id: Signal<number> = signal(0);
  public attributes: StateAttributes = new StateAttributes();
  public relationships: StateRelationships = new StateRelationships();

  public static getInstance(): State {
    return State.instance || new State();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.name = object.attributes?.name ?? this.attributes.name;
    this.attributes.code = object.attributes?.code ?? this.attributes.code;
    // Relationships
    if (object.relationships?.country.data) {
      this.relationships.country.data.setAttributesFromPlainObject(
        object.relationships?.country?.data
      );
    }
  }

  public getPlainAttributes(): Object {
    return {
      name: this.attributes.name,
      code: this.attributes.code,
    };
  }

  public getPlainRelationships(): Object {
    return {
      country: this.relationships.country.data.getPlainAttributes(),
    };
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StateAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _code: Signal<string> = signal('');

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

  public get country() {
    return this._country.value;
  }
  public set country(value) {
    this._country.value = value;
  }
}
