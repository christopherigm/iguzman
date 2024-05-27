import { Signal, signal } from '@preact-signals/safe-react';
import API from '../api';
import City from '../classes/city';
import { BaseUser } from '../classes/base-user';
import type { Languages } from '../interfaces/system-interface';

type AddressTypes = 'house' | 'apartment' | 'work' | 'mail_box';
type AddressItem = {
  slug: string;
  label: {
    en: string;
    es: string;
  };
  icon: string;
  selected: boolean;
};

const addressTypesArray: Array<AddressItem> = [
  {
    slug: 'house',
    label: {
      en: 'House',
      es: 'Casa',
    },
    icon: 'Home',
    selected: false,
  },
  {
    slug: 'apartment',
    label: {
      en: 'Apartment',
      es: 'Departamento',
    },
    icon: 'Apartment',
    selected: false,
  },
  {
    slug: 'work',
    label: {
      en: 'Work',
      es: 'Trabajo',
    },
    icon: 'Work',
    selected: false,
  },
  {
    slug: 'mail_box',
    label: {
      en: 'Mailbox',
      es: 'Buzon',
    },
    icon: 'MarkunreadMailbox',
    selected: false,
  },
];

export class BaseUserAddress {
  public static instance: BaseUserAddress;
  public type = 'UserAddress';
  protected endpoint = 'v1/user-address';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _language: Signal<Languages> = signal('en');
  private _access: Signal<string> = signal('');
  public attributes: BaseUserAddressAttributes =
    new BaseUserAddressAttributes();
  public relationships: BaseUserAddressRelationships =
    new BaseUserAddressRelationships();
  private _addressTypeItems: Signal<Array<AddressTypeMenuItem>> = signal([]);

  public static getInstance(): BaseUserAddress {
    return BaseUserAddress.instance || new BaseUserAddress();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.alias = object.attributes.alias ?? this.attributes.alias;
    this.attributes.receptor_name =
      object.attributes.receptor_name ?? this.attributes.receptor_name;
    this.attributes.phone = object.attributes.phone ?? this.attributes.phone;
    this.attributes.zip_code =
      object.attributes.zip_code ?? this.attributes.zip_code;
    this.attributes.street = object.attributes.street ?? this.attributes.street;
    this.attributes.ext_number =
      object.attributes.ext_number ?? this.attributes.ext_number;
    this.attributes.int_number =
      object.attributes.int_number ?? this.attributes.int_number;
    this.attributes.reference =
      object.attributes.reference ?? this.attributes.reference;
    this.attributes.address_type =
      object.attributes.address_type ?? this.attributes.address_type;
    this.attributes.delivery_instructions =
      object.attributes.delivery_instructions ??
      this.attributes.delivery_instructions;
    // Relationships
    if (object.relationships?.city?.data) {
      this.relationships.city.data.setAttributesFromPlainObject(
        object.relationships?.city?.data
      );
    }
  }

  public getPlainAttributes(): Object {
    return {
      alias: this.attributes.alias,
      receptor_name: this.attributes.receptor_name,
      phone: this.attributes.phone,
      zip_code: this.attributes.zip_code,
      street: this.attributes.street,
      ext_number: this.attributes.ext_number,
      int_number: this.attributes.int_number,
      reference: this.attributes.reference,
      address_type: this.attributes.address_type,
      delivery_instructions: this.attributes.delivery_instructions,
    };
  }

  public getPlainRelationships(): Object {
    return {
      city: this.relationships.city.data.getPlainAttributes(),
    };
  }

  public getPlainObject(): Object {
    return {
      id: this.id,
      type: this.type,
      attributes: this.getPlainAttributes(),
      relationships: this.getPlainRelationships(),
    };
  }

  public getPlainRelationshipsForAPI(): Object {
    const obj: any = {};
    if (this.relationships.city.data.id) {
      obj.city = {
        type: this.relationships.city.data.type,
        id: this.relationships.city.data.id,
      };
    }
    return obj;
  }

  public CreateUserAddress(): Promise<string> {
    return new Promise((res, rej) => {
      if (!this.URLBase || !this.access) {
        return rej(new Error('No url or access token'));
      }
      const attributes = this.getPlainAttributes();
      const relationships = this.getPlainRelationshipsForAPI();
      const url = `${this.URLBase}/${this.endpoint}/`;
      API.Post({
        url,
        jwt: this.access,
        data: {
          type: this.type,
          attributes: attributes,
          relationships: relationships,
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
      const attributes = this.getPlainAttributes();
      // const relationships = this.getPlainRelationships();
      const url = `${this.URLBase}/${this.endpoint}/${this.id}/`;
      API.Patch({
        url,
        jwt: this.access,
        data: {
          type: this.type,
          id: this.id,
          attributes: attributes,
          // relationships: relationships,
        },
      })
        .then((response) => res(response.data))
        .catch((error) => rej(error));
    });
  }

  public DeleteUserAddress(): Promise<void> {
    return new Promise((res, rej) => {
      if (!this.URLBase || !this.access || !this.id) {
        return rej(new Error('No url or access token'));
      }
      const url = `${this.URLBase}/${this.endpoint}/${this.id}/`;
      API.Delete({
        url,
        jwt: this.access,
      })
        .then(() => res())
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

  public updateAddressTypeSelected(slug: string) {
    this.addressTypeItems.forEach((i: AddressTypeMenuItem) => {
      i.selected = i.slug === slug;
    });
    this.attributes.address_type = slug as AddressTypes;
    this.addressTypeItems = [...this.addressTypeItems];
  }

  public get addressTypeItems() {
    if (!this._addressTypeItems.value.length) {
      const items: Array<AddressTypeMenuItem> = [];
      addressTypesArray.forEach((i) => {
        const e = new AddressTypeMenuItem();
        e.slug = i.slug as AddressTypes;
        e.label = i.label[this.language];
        e.icon = i.icon;
        if (e.slug === this.attributes.address_type) {
          e.selected = true;
        }
        items.push(e);
      });
      this._addressTypeItems.value = items;
    }
    return this._addressTypeItems.value;
  }

  public set addressTypeItems(value) {
    this._addressTypeItems.value = value;
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
