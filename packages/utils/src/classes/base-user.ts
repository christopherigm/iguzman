import { Signal, signal } from '@preact-signals/safe-react';
import { GetLocalStorageData, SetLocalStorageData } from '../lib/local-storage';
import type { JWTPayload } from '../interfaces/jwt-interface';
import API from '../api';

export class BaseUser {
  public static instance: BaseUser;
  public type = 'User';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _jwt: Signal<JWTPayload> = signal({
    exp: 0,
    iat: 0,
    jti: '',
    token_type: '',
    user_id: 0,
    access: '',
    refresh: '',
  });
  private _access: Signal<string> = signal('');
  public attributes: BaseUserAttributes = new BaseUserAttributes();

  public static getInstance(): BaseUser {
    return BaseUser.instance || new BaseUser();
  }

  public sayHello() {
    if (this.attributes && this.attributes.first_name) {
      console.log(`Hello ${this.attributes.first_name}!`);
    } else {
      console.log('Hello!');
    }
  }

  public setUserAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.jwt = object.jwt ?? this.jwt;
    this.access = object.access ?? this.access;
    this.attributes.email = object.attributes?.email ?? this.attributes.email;
    this.attributes.username =
      object.attributes?.username ?? this.attributes.username;
    this.attributes.first_name =
      object.attributes?.first_name ?? this.attributes.first_name;
    this.attributes.last_name =
      object.attributes?.last_name ?? this.attributes.last_name;
    this.attributes.img_picture =
      object.attributes?.img_picture ?? this.attributes.img_picture;
    this.attributes.theme = object.attributes?.theme ?? this.attributes.theme;
    this.attributes.theme_color =
      object.attributes?.theme_color ?? this.attributes.theme_color;
    this.attributes.profile_picture_shape =
      object.attributes?.profile_picture_shape ??
      this.attributes.profile_picture_shape;
    this.attributes.phone_number =
      object.attributes?.phone_number ?? this.attributes.phone_number;
  }

  public getUserFromLocalStorage() {
    let cachedUser: any = GetLocalStorageData(this.type);
    if (cachedUser) {
      this.setUserAttributesFromPlainObject(JSON.parse(cachedUser));
    }
  }

  public saveUserToLocalStorage() {
    let attributes = this.attributes;
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

  public getPlainAttributes(): Object {
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
    };
  }

  public updateUserData(urlBase?: string): Promise<void> {
    return new Promise((res, rej) => {
      const URLBase = urlBase ?? this.URLBase;
      if (!URLBase || URLBase === '') {
        return rej(new Error('No URLBase'));
      }
      const attributes: any = this.getPlainAttributes();
      if (this.attributes.img_picture.search(';base64') < 0) {
        delete attributes.img_picture;
      }
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
          this.saveUserToLocalStorage();
          this.getUserFromLocalStorage();
          res();
        })
        .catch((error) => rej(error));
    });
  }

  public login(urlBase?: string): Promise<JWTPayload> {
    return new Promise((res, rej) => {
      const URLBase = urlBase ?? this.URLBase;
      if (!URLBase || URLBase === '') {
        return rej(new Error('No URL Base'));
      }
      if (!this.attributes.email || !this.attributes.password) {
        return rej(new Error('No credentials'));
      }
      API.Login({
        URLBase,
        attributes: {
          username: this.attributes.email,
          password: this.attributes.password,
        },
      })
        .then((data: JWTPayload) => {
          this.jwt = data;
          this.id = data.user_id;
          this.access = data.access;
          res(data);
        })
        .catch((error) => rej(error));
    });
  }

  public getUserFromAPI(urlBase?: string): Promise<any> {
    return new Promise((res, rej) => {
      const URLBase = urlBase ?? this.URLBase;
      if (!URLBase || URLBase === '') {
        return rej(new Error('No URL Base'));
      }
      if (!this.access || !this.id) {
        return rej(new Error('No credentials'));
      }
      API.GetUser({
        URLBase,
        jwt: this.access,
        userID: this.id,
      })
        .then((data: any) => res(data))
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

  public get jwt() {
    return this._jwt.value;
  }
  public set jwt(value) {
    this._jwt.value = value;
  }
}

export class BaseUserAttributes {
  private _email: Signal<string> = signal('');
  private _username: Signal<string> = signal('');
  private _password: Signal<string> = signal('');
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

  public get password() {
    return this._password.value;
  }
  public set password(value) {
    this._password.value = value;
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
