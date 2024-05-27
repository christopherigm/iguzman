import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';

export default class Country {
  public static instance: Country;
  public type: string = 'Country';
  private _id: Signal<number> = signal(0);
  public attributes: CountryAttributes = new CountryAttributes();

  public static getInstance(): Country {
    return Country.instance || new Country();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.name = object.attributes?.name ?? this.attributes.name;
    this.attributes.code = object.attributes?.code ?? this.attributes.code;
    this.attributes.phone_code =
      object.attributes?.phone_code ?? this.attributes.phone_code;
    this.attributes.img_flag =
      object.attributes?.img_flag ?? this.attributes.img_flag;
  }

  public getPlainAttributes(): any {
    return {
      name: this.attributes.name,
      code: this.attributes.code,
      phone_code: this.attributes.phone_code,
      img_flag: this.attributes.img_flag,
    };
  }

  public getPlainObject(): any {
    return {
      id: this.id,
      type: this.type,
      attributes: this.getPlainAttributes(),
    };
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class CountryAttributes extends CommonFields {
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
