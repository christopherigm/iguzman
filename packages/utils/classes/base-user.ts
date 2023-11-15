import { Signal, signal,  } from "@preact/signals-react";

export class BaseUser {
  public static instance: BaseUser;
  protected type = 'User';
  private _id: Signal<number> = signal(0);
  public attributes: BaseUserAttributes = new BaseUserAttributes();

  public static getInstance(): BaseUser {
    return BaseUser.instance || new BaseUser();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

export class BaseUserAttributes {
  private _email: Signal<string> = signal('');
  private _username: Signal<string> = signal('');
  private _first_name: Signal<string> = signal('');
  private _last_name: Signal<string> = signal('');
  private _img_picture: Signal<string> = signal('');
  private _theme: Signal<string> = signal('');
  private _theme_color: Signal<string> = signal('');
  private _profile_picture_shape: Signal<string> = signal('');
  private _phone_number: Signal<string> = signal('');
  
  public get email() {
    return this._email.value;
  }
  public set email(value) {
    this._email.value = value;
  }
  
  public get username() {
    return this._username.value;
  }
  public set username(value) {
    this._username.value = value;
  }
  
  public get first_name() {
    return this._first_name.value;
  }
  public set first_name(value) {
    this._first_name.value = value;
  }
  
  public get last_name() {
    return this._last_name.value;
  }
  public set last_name(value) {
    this._last_name.value = value;
  }
  
  public get img_picture() {
    return this._img_picture.value;
  }
  public set img_picture(value) {
    this._img_picture.value = value;
  }
  
  public get theme() {
    return this._theme.value;
  }
  public set theme(value) {
    this._theme.value = value;
  }
  
  public get theme_color() {
    return this._theme_color.value;
  }
  public set theme_color(value) {
    this._theme_color.value = value;
  }
  
  public get profile_picture_shape() {
    return this._profile_picture_shape.value;
  }
  public set profile_picture_shape(value) {
    this._profile_picture_shape.value = value;
  }
  
  public get phone_number() {
    return this._phone_number.value;
  }
  public set phone_number(value) {
    this._phone_number.value = value;
  }
}
