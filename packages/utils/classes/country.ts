import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';

export default class Country extends CommonFields {
  public static instance: Country;
  protected type: string = 'Country';
  private _id: Signal<number> = signal(0);
  public attributes: CountryAttributes = new CountryAttributes();
  // public relationships: StandRelationships = new CountryAttributes();

  public static getInstance(): Country {
    return Country.instance || new Country();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value: number) {
    this._id.value = value;
  }
}

class CountryAttributes {
  private _name: Signal<string> = signal('');
  private _code: Signal<string> = signal('');
  private _phone_code: Signal<string> = signal('');
  private _img_flag: Signal<string> = signal('');

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

  public get phone_code() {
    return this._phone_code.value;
  }
  public set phone_code(value) {
    this._phone_code.value = value;
  }

  public get img_flag() {
    return this._img_flag.value;
  }
  public set img_flag(value) {
    this._img_flag.value = value;
  }
}
