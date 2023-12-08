import { Signal, signal } from '@preact/signals-react';
import { BaseUser, BaseUserAttributes, GetLocalStorageData, API } from 'utils';

export default class User extends BaseUser {
  public static instance: User;
  public attributes: UserAttributes = new UserAttributes();

  public static getInstance(): User {
    return User.instance || new User();
  }

  public getNediiUserFromLocalStorage() {
    this.getUserFromLocalStorage();
    let cachedUser: any = GetLocalStorageData(this.type);
    if (cachedUser) {
      cachedUser = JSON.parse(cachedUser);
      this.attributes.is_seller =
        cachedUser?.attributes?.is_seller ?? this.attributes.is_seller;
      this.attributes.newsletter =
        cachedUser?.attributes?.newsletter ?? this.attributes.newsletter;
      this.attributes.promotions =
        cachedUser?.attributes?.promotions ?? this.attributes.promotions;
      this.attributes.biography =
        cachedUser?.attributes?.biography ?? this.attributes.biography;
      this.attributes.owner_position =
        cachedUser?.attributes?.owner_position ??
        this.attributes.owner_position;
      this.attributes.owner_position_description =
        cachedUser?.attributes?.owner_position_description ??
        this.attributes.owner_position_description;
      this.attributes.owner_phone =
        cachedUser?.attributes?.owner_phone ?? this.attributes.owner_phone;
      this.attributes.owner_office_phone =
        cachedUser?.attributes?.owner_office_phone ??
        this.attributes.owner_office_phone;
      this.attributes.owner_email =
        cachedUser?.attributes?.owner_email ?? this.attributes.owner_email;
      this.attributes.owner_whatsapp =
        cachedUser?.attributes?.owner_whatsapp ??
        this.attributes.owner_whatsapp;
      this.attributes.owner_address =
        cachedUser?.attributes?.owner_address ?? this.attributes.owner_address;
    }
  }

  getPlainAttributes(): Object {
    return {
      email: this.attributes.email,
      username: this.attributes.username,
      password: this.attributes.password,
      first_name: this.attributes.first_name,
      last_name: this.attributes.last_name,
      img_picture: this.attributes.img_picture,
      theme: this.attributes.theme,
      theme_color: this.attributes.theme_color,
      profile_picture_shape: this.attributes.profile_picture_shape,
      phone_number: this.attributes.phone_number,
      is_seller: this.attributes.is_seller,
      newsletter: this.attributes.newsletter,
      promotions: this.attributes.promotions,
      biography: this.attributes.biography,
      owner_position: this.attributes.owner_position,
      owner_position_description: this.attributes.owner_position_description,
      owner_phone: this.attributes.owner_phone,
      owner_office_phone: this.attributes.owner_office_phone,
      owner_email: this.attributes.owner_email,
      owner_whatsapp: this.attributes.owner_whatsapp,
      owner_address: this.attributes.owner_address,
    };
  }
}

class UserAttributes extends BaseUserAttributes {
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

  public get is_seller() {
    return this._is_seller.value;
  }
  public set is_seller(value: boolean) {
    this._is_seller.value = value;
  }

  public get newsletter() {
    return this._newsletter.value;
  }
  public set newsletter(value: boolean) {
    this._newsletter.value = value;
  }

  public get promotions() {
    return this._promotions.value;
  }
  public set promotions(value: boolean) {
    this._promotions.value = value;
  }

  public get biography() {
    return this._biography.value;
  }
  public set biography(value: string) {
    this._biography.value = value;
  }

  public get owner_position() {
    return this._owner_position.value;
  }
  public set owner_position(value: string) {
    this._owner_position.value = value;
  }

  public get owner_position_description() {
    return this._owner_position_description.value;
  }
  public set owner_position_description(value: string) {
    this._owner_position_description.value = value;
  }

  public get owner_phone() {
    return this._owner_phone.value;
  }
  public set owner_phone(value: string) {
    this._owner_phone.value = value;
  }

  public get owner_office_phone() {
    return this._owner_office_phone.value;
  }
  public set owner_office_phone(value: string) {
    this._owner_office_phone.value = value;
  }

  public get owner_email() {
    return this._owner_email.value;
  }
  public set owner_email(value: string) {
    this._owner_email.value = value;
  }

  public get owner_whatsapp() {
    return this._owner_whatsapp.value;
  }
  public set owner_whatsapp(value: string) {
    this._owner_whatsapp.value = value;
  }

  public get owner_address() {
    return this._owner_address.value;
  }
  public set owner_address(value: string) {
    this._owner_address.value = value;
  }
}

export const user = signal<User>(User.getInstance()).value;
