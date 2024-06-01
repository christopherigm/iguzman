import { Signal, signal } from '@preact-signals/safe-react';
import {
  API,
  RebuildData,
  BaseUser,
  BaseUserAttributes,
  BaseUserAddress,
  GetLocalStorageData,
  SetLocalStorageData,
  removeImagesForAPICall,
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

  public setNediiUserAttributesFromPlainObject(object: any) {
    this.setUserAttributesFromPlainObject(object ?? {});
    this.attributes.token = object?.attributes?.token ?? this.attributes.token;
    this.attributes.is_seller =
      object?.attributes?.is_seller ?? this.attributes.is_seller;
    this.attributes.newsletter =
      object?.attributes?.newsletter ?? this.attributes.newsletter;
    this.attributes.promotions =
      object?.attributes?.promotions ?? this.attributes.promotions;
    this.attributes.biography =
      object?.attributes?.biography ?? this.attributes.biography;
    this.attributes.owner_position =
      object?.attributes?.owner_position ?? this.attributes.owner_position;
    this.attributes.owner_position_description =
      object?.attributes?.owner_position_description ??
      this.attributes.owner_position_description;
    this.attributes.owner_phone =
      object?.attributes?.owner_phone ?? this.attributes.owner_phone;
    this.attributes.biography =
      object?.attributes?.biography ?? this.attributes.biography;
    this.attributes.owner_office_phone =
      object?.attributes?.owner_office_phone ??
      this.attributes.owner_office_phone;
    this.attributes.owner_email =
      object?.attributes?.owner_email ?? this.attributes.owner_email;
    this.attributes.owner_whatsapp =
      object?.attributes?.owner_whatsapp ?? this.attributes.owner_whatsapp;
    this.attributes.owner_address =
      object?.attributes?.owner_address ?? this.attributes.owner_address;
  }

  public getNediiUserFromLocalStorage() {
    this.getUserFromLocalStorage();
    let cachedUser: any = GetLocalStorageData(this.type);
    if (cachedUser) {
      cachedUser = JSON.parse(cachedUser);
      this.setNediiUserAttributesFromPlainObject(cachedUser);
    }
  }

  public getNediiUserPlainAttributes(): Object {
    return {
      ...this.getPlainAttributes(),
      ...(this.attributes.token && { token: this.attributes.token }),
      ...(this.attributes.is_seller && {
        is_seller: this.attributes.is_seller,
      }),
      ...(this.attributes.newsletter && {
        newsletter: this.attributes.newsletter,
      }),
      ...(this.attributes.promotions && {
        promotions: this.attributes.promotions,
      }),
      ...(this.attributes.biography && {
        biography: this.attributes.biography,
      }),
      ...(this.attributes.owner_position && {
        owner_position: this.attributes.owner_position,
      }),
      ...(this.attributes.owner_position_description && {
        owner_position_description: this.attributes.owner_position_description,
      }),
      ...(this.attributes.owner_phone && {
        owner_phone: this.attributes.owner_phone,
      }),
      ...(this.attributes.owner_office_phone && {
        owner_office_phone: this.attributes.owner_office_phone,
      }),
      ...(this.attributes.owner_email && {
        owner_email: this.attributes.owner_email,
      }),
      ...(this.attributes.owner_whatsapp && {
        owner_whatsapp: this.attributes.owner_whatsapp,
      }),
      ...(this.attributes.owner_address && {
        owner_address: this.attributes.owner_address,
      }),
    };
  }

  public getPlainObject(): Object {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.getNediiUserPlainAttributes(),
    };
  }

  public getNediiUserFromAPI(urlBase?: string): Promise<any> {
    return new Promise((res, rej) => {
      this.URLBase = urlBase ?? this.URLBase;
      if (!this.URLBase || this.URLBase === '') {
        return rej(new Error('No URL Base'));
      }
      if (this.id) {
        API.GetUser({
          URLBase: this.URLBase,
          jwt: '',
          userID: this.id,
        })
          .then((response: any) => res(RebuildData(response).data))
          .catch((error) => rej(error));
      } else if (this.attributes.username) {
        let url = `${this.URLBase}/v1/users/?filter[username]=${this.attributes.username}`;
        // url += '&include=city,city.state,city.state.country';
        API.Get({ url })
          .then((response) =>
            res(response.data.length ? RebuildData(response).data[0] : {})
          )
          .catch((error) => rej(error));
      } else {
        rej('No user id or username');
      }
    });
  }

  public updateNediiUserData(urlBase?: string): Promise<void> {
    return new Promise((res, rej) => {
      const URLBase = urlBase ?? this.URLBase;
      if (!URLBase || URLBase === '') {
        return rej(new Error('No URLBase'));
      }
      const attributes: any = this.getNediiUserPlainAttributes();
      removeImagesForAPICall(attributes);
      if (attributes.password === '') {
        delete attributes.password;
      }
      API.UpdateUser({
        URLBase,
        jwt: this.access,
        id: this.id,
        attributes,
      })
        .then(() =>
          API.GetUser({
            URLBase,
            userID: this.id,
            jwt: this.access,
          })
        )
        .then(() => {
          this.saveNediiUserToLocalStorage();
          this.getNediiUserFromLocalStorage();
          res();
        })
        .catch((error) => rej(error));
    });
  }

  public saveNediiUserToLocalStorage() {
    let attributes: any = this.getNediiUserPlainAttributes();
    attributes.password = '';
    SetLocalStorageData(
      this.type,
      JSON.stringify({
        id: this.id,
        type: this.type,
        access: this.access,
        jwt: this.jwt,
        attributes,
      })
    );
  }

  public getUserAddressesFromAPI(): Promise<Array<any>> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/v1/user-address/?filter[user]=${this.id}`;
      url += '&include=city,city.state,city.state.country';
      API.Get({
        url,
        jwt: this.access,
      })
        .then((response: { data: Array<any> }) => {
          const rawData = response.data.length
            ? RebuildData(response).data
            : [];
          this.addresses = [];
          rawData.forEach((i: any) => {
            const newItem = new BaseUserAddress();
            newItem.id = Number(i.id);
            newItem.URLBase = this.URLBase;
            newItem.access = this.access;
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
        jwt: this.access,
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
            newItem.URLBase = this.URLBase;
            newItem.access = this.access;
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
