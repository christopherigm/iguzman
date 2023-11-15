import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';
import Country from './country';

export default class State extends CommonFields {
  public static instance: State;
  protected type: string = 'Stand';
  private _id: Signal<number> = signal(0);
  public attributes: StateAttributes = new StateAttributes();
  public relationships: StateRelationships = new StateRelationships();

  public static getInstance(): State {
    return State.instance || new State();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value: number) {
    this._id.value = value;
  }
}

class StateAttributes {
  private _name: Signal<string> = signal('');

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
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
