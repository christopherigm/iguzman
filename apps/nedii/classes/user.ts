import { Signal, signal } from '@preact/signals-react';
import { BaseUser, BaseUserAttributes } from 'utils';

export default class User extends BaseUser {
  public static instance: User;
  public attributes: UserAttributes = new UserAttributes();

  public static getInstance(): User {
    return User.instance || new User();
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
