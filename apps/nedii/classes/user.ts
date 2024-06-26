import { Signal, signal } from '@preact-signals/safe-react';
import {
  API,
  RebuildData,
  BaseUser,
  BaseUserAttributes,
  BaseUserAddress,
} from '@repo/utils';
import Stand from 'classes/stand';

export default class User extends BaseUser {
  public static instance: User;
  public attributes: UserAttributes = new UserAttributes();
  private _addresses: Signal<Array<BaseUserAddress>> = signal([]);
  private _companies: Signal<Array<Stand>> = signal([]);

  public static getInstance(): User {
    return User.instance || new User();
  }

  public getUserFromAPI(): Promise<any> {
    return new Promise((res, rej) => {
      super
        .getUserFromAPI()
        .then((data) => {
          this.setDataFromPlainObject(data);
          this.saveLocalStorage();
          res(data);
        })
        .catch((e) => rej(e));
    });
  }

  public updateUserData(): Promise<void> {
    return new Promise((res, rej) => {
      super
        .updateUserData()
        .then(() => res(this.getUserFromAPI()))
        .catch((e) => rej(e));
    });
  }

  public getUserAddressesFromAPI(): Promise<Array<any>> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/v1/user-address/?filter[user]=${this.id}`;
      url += '&include=city,city.state,city.state.country';
      API.Get({
        url,
        jwt: this.jwt.access,
      })
        .then((response: { data: Array<any> }) => {
          const rawData = response.data.length
            ? RebuildData(response).data
            : [];
          this.addresses = [];
          rawData.forEach((i: any) => {
            const newItem = new BaseUserAddress();
            newItem.id = Number(i.id);
            newItem.setAttributesFromPlainObject(i);
            this.addresses.push(newItem);
          });
          this.addresses = [...this.addresses];
          res(rawData);
        })
        .catch((error) => rej(error));
    });
  }

  public getUserCompaniesFromAPI(): Promise<Array<any>> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/v1/stands/?filter[owner]=${this.id}`;
      url += '&include=city,city.state,city.state.country,phones,';
      url += 'pictures';
      API.Get({
        url,
        jwt: this.jwt.access,
      })
        .then((response: { data: Array<any> }) => {
          const rawData =
            response && response.data && response.data.length
              ? RebuildData(response).data
              : [];
          this.companies = [];
          rawData.forEach((i: any) => {
            const newItem = new Stand();
            newItem.id = Number(i.id);
            newItem.setDataFromPlainObject(i);
            this.companies.push(newItem);
          });
          this.companies = [...this.companies];
          res(rawData);
        })
        .catch((error) => rej(error));
    });
  }

  public get addresses() {
    return this._addresses.value;
  }
  public set addresses(value) {
    this._addresses.value = value;
  }

  public get companies() {
    return this._companies.value;
  }
  public set companies(value) {
    this._companies.value = value;
  }
}

class UserAttributes extends BaseUserAttributes {
  private _token: Signal<string> = signal('');
  private _is_seller: Signal<boolean> = signal(false);
  private _newsletter: Signal<boolean> = signal(false);
  private _promotions: Signal<boolean> = signal(false);
  private _biography: Signal<string> = signal('');
  private _owner_position: Signal<string> = signal('');
  private _owner_position_description: Signal<string> = signal('');
  private _owner_phone: Signal<string> = signal('');
  private _owner_office_phone: Signal<string> = signal('');
  private _owner_email: Signal<string> = signal('');
  private _owner_whatsapp: Signal<string> = signal('');
  private _owner_address: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.token = object.attributes.token ?? this.token;
      this.is_seller = object.attributes.is_seller;
      this.newsletter = object.attributes.newsletter;
      this.promotions = object.attributes.promotions;
      this.biography = object.attributes.biography ?? this.biography;
      this.owner_position =
        object.attributes.owner_position ?? this.owner_position;
      this.owner_position_description =
        object.attributes.owner_position_description ??
        this.owner_position_description;
      this.owner_phone = object.attributes.owner_phone ?? this.owner_phone;
      this.biography = object.attributes.biography ?? this.biography;
      this.owner_office_phone =
        object.attributes.owner_office_phone ?? this.owner_office_phone;
      this.owner_email = object.attributes.owner_email ?? this.owner_email;
      this.owner_whatsapp =
        object.attributes.owner_whatsapp ?? this.owner_whatsapp;
      this.owner_address =
        object.attributes.owner_address ?? this.owner_address;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.token && { token: this.token }),
      is_seller: this.is_seller,
      newsletter: this.newsletter,
      promotions: this.promotions,
      ...(this.biography && {
        biography: this.biography,
      }),
      ...(this.owner_position && {
        owner_position: this.owner_position,
      }),
      ...(this.owner_position_description && {
        owner_position_description: this.owner_position_description,
      }),
      ...(this.owner_phone && {
        owner_phone: this.owner_phone,
      }),
      ...(this.owner_office_phone && {
        owner_office_phone: this.owner_office_phone,
      }),
      ...(this.owner_email && {
        owner_email: this.owner_email,
      }),
      ...(this.owner_whatsapp && {
        owner_whatsapp: this.owner_whatsapp,
      }),
      ...(this.owner_address && {
        owner_address: this.owner_address,
      }),
    };
  }

  public get token() {
    return this._token.value;
  }
  public set token(value) {
    this._token.value = value;
  }

  public get is_seller() {
    return this._is_seller.value;
  }
  public set is_seller(value) {
    this._is_seller.value = value;
  }

  public get newsletter() {
    return this._newsletter.value;
  }
  public set newsletter(value) {
    this._newsletter.value = value;
  }

  public get promotions() {
    return this._promotions.value;
  }
  public set promotions(value) {
    this._promotions.value = value;
  }

  public get biography() {
    return this._biography.value;
  }
  public set biography(value) {
    this._biography.value = value;
  }

  public get owner_position() {
    return this._owner_position.value;
  }
  public set owner_position(value) {
    this._owner_position.value = value;
  }

  public get owner_position_description() {
    return this._owner_position_description.value;
  }
  public set owner_position_description(value) {
    this._owner_position_description.value = value;
  }

  public get owner_phone() {
    return this._owner_phone.value;
  }
  public set owner_phone(value) {
    this._owner_phone.value = value;
  }

  public get owner_office_phone() {
    return this._owner_office_phone.value;
  }
  public set owner_office_phone(value) {
    this._owner_office_phone.value = value;
  }

  public get owner_email() {
    return this._owner_email.value;
  }
  public set owner_email(value) {
    this._owner_email.value = value;
  }

  public get owner_whatsapp() {
    return this._owner_whatsapp.value;
  }
  public set owner_whatsapp(value) {
    this._owner_whatsapp.value = value;
  }

  public get owner_address() {
    return this._owner_address.value;
  }
  public set owner_address(value) {
    this._owner_address.value = value;
  }
}

export const user = signal<User>(User.getInstance()).value;
