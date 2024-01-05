import { Signal, signal } from '@preact/signals-react';
import {
  API,
  City,
  BaseUser,
  GetLocalStorageData,
  SetLocalStorageData,
} from 'utils';
import type { Languages } from 'utils';
import HomeIcon from '@mui/icons-material/Home';
import ApartmentIcon from '@mui/icons-material/Apartment';
import WorkIcon from '@mui/icons-material/Work';
import MarkunreadMailboxIcon from '@mui/icons-material/MarkunreadMailbox';
import { ReactElement } from 'react';
import { GetIconByName } from 'ui';

type AddressTypes = 'house' | 'apartment' | 'work' | 'mail_box';
const addressTypesArray = [
  {
    slug: 'house',
    label: {
      en: 'House',
      es: 'Casa',
    },
    icon: 'HomeIcon',
  },
];

export class BaseUserAddress {
  public static instance: BaseUserAddress;
  public type = 'UserAddress';
  protected endpoint = 'v1/user-address/';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _language: Signal<Languages> = signal('en');
  private _access: Signal<string> = signal('');
  public attributes: BaseUserAddressAttributes =
    new BaseUserAddressAttributes();
  public relationships: BaseUserAddressRelationships =
    new BaseUserAddressRelationships();
  public _addressTypeMenu: Array<AddressTypeMenuItem> = [];

  public get AddressTypeMenu(): Array<AddressTypeMenuItem> {
    if (!this._addressTypeMenu.length) {
      const items: Array<AddressTypeMenuItem> = [];
      addressTypesArray.forEach((i) => {
        const e = new AddressTypeMenuItem();
        e.slug = i.slug as AddressTypes;
        e.label = i.label[this.language];
        e.icon = i.icon;
        items.push(e);
      });
      this._addressTypeMenu = items;
    }
    return this._addressTypeMenu;
  }

  public static getInstance(): BaseUserAddress {
    return BaseUserAddress.instance || new BaseUserAddress();
  }

  public CreateUserAddress(): Promise<string> {
    return new Promise((res, rej) => {
      if (!this.URLBase || !this.access) {
        return rej(new Error('No url or access token'));
      }
      const url = `${this.URLBase}/${this.endpoint}`;
      API.Post({
        url,
        jwt: this.access,
        data: {
          type: this.type,
          attributes: this.attributes,
          relationships: this.relationships,
        },
      })
        .then((response) => res(response.data))
        .catch((error) => rej(error));
    });
  }

  public UpdateUserAddress(): Promise<string> {
    return new Promise((res, rej) => {
      if (!this.URLBase || !this.access || !this.id) {
        return rej(new Error('No url or access token'));
      }
      const url = `${this.URLBase}/${this.endpoint}/${this.id}/`;
      API.Patch({
        url,
        jwt: this.access,
        data: {
          type: this.type,
          id: this.id,
          attributes: this.attributes,
          relationships: this.relationships,
        },
      })
        .then((response) => res(response.data))
        .catch((error) => rej(error));
    });
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }

  public get URLBase() {
    return this._URLBase.value;
  }
  public set URLBase(value) {
    this._URLBase.value = value;
  }

  public get access() {
    return this._access.value;
  }
  public set access(value) {
    this._access.value = value;
  }

  public get language() {
    return this._language.value;
  }
  public set language(value) {
    this._language.value = value;
  }
}

export class AddressTypeMenuItem {
  private _slug: Signal<AddressTypes> = signal('house');
  private _label: Signal<string> = signal('House');
  private _icon: Signal<string> = signal('HomeIcon');
  private _selected: Signal<boolean> = signal(false);

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }

  public get label() {
    return this._label.value;
  }
  public set label(value) {
    this._label.value = value;
  }

  public get icon() {
    return this._icon.value;
  }
  public set icon(value) {
    this._icon.value = value;
  }

  public get selected() {
    return this._selected.value;
  }
  public set selected(value) {
    this._selected.value = value;
  }
}

export class BaseUserAddressAttributes {
  private _alias: Signal<string> = signal('');
  private _receptor_name: Signal<string> = signal('');
  private _phone: Signal<string> = signal('');
  private _zip_code: Signal<string> = signal('');
  private _street: Signal<string> = signal('');
  private _ext_number: Signal<string> = signal('');
  private _int_number: Signal<string> = signal('');
  private _reference: Signal<string> = signal('');
  private _address_type: Signal<AddressTypes> = signal('house');
  private _delivery_instructions: Signal<string> = signal('');

  public _city: Signal<{ data: City }> = signal({
    data: City.getInstance(),
  });

  public get alias() {
    return this._alias.value;
  }
  public set alias(value) {
    this._alias.value = value;
  }

  public get receptor_name() {
    return this._receptor_name.value;
  }
  public set receptor_name(value) {
    this._receptor_name.value = value;
  }

  public get phone() {
    return this._phone.value;
  }
  public set phone(value) {
    this._phone.value = value;
  }

  public get zip_code() {
    return this._zip_code.value;
  }
  public set zip_code(value) {
    this._zip_code.value = value;
  }

  public get street() {
    return this._street.value;
  }
  public set street(value) {
    this._street.value = value;
  }

  public get ext_number() {
    return this._ext_number.value;
  }
  public set ext_number(value) {
    this._ext_number.value = value;
  }

  public get int_number() {
    return this._int_number.value;
  }
  public set int_number(value) {
    this._int_number.value = value;
  }

  public get reference() {
    return this._reference.value;
  }
  public set reference(value) {
    this._reference.value = value;
  }

  public get address_type() {
    return this._address_type.value;
  }
  public set address_type(value) {
    this._address_type.value = value;
  }

  public get delivery_instructions() {
    return this._delivery_instructions.value;
  }
  public set delivery_instructions(value) {
    this._delivery_instructions.value = value;
  }
}

export class BaseUserAddressRelationships {
  public _city: Signal<{ data: City }> = signal({
    data: City.getInstance(),
  });
  public _user: Signal<{ data: BaseUser }> = signal({
    data: BaseUser.getInstance(),
  });

  public get city() {
    return this._city.value;
  }
  public set city(value) {
    this._city.value = value;
  }

  public get user() {
    return this._user.value;
  }
  public set user(value) {
    this._user.value = value;
  }
}
