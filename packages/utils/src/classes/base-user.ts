import { Signal, signal } from '@preact-signals/safe-react';
import { GetLocalStorageData, SetLocalStorageData } from '../lib/local-storage';
import type { JWTPayload } from '../interfaces/jwt-interface';
import API from '../api';
import CommonFields from './common-fields';

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

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.jwt = object.jwt ?? this.jwt;
    this.access = object.access ?? this.access;
    this.attributes.setAttributesFromPlainObject(object);
  }

  public getPlainObject(): any {
    return {
      id: this.id,
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
    };
  }

  public getMinimumPlainObject(): any {
    return {
      id: this.id,
      type: this.type,
    };
  }

  public setDataFromLocalStorage() {
    let cachedUser: any = GetLocalStorageData(this.type);
    if (cachedUser) {
      this.setDataFromPlainObject(JSON.parse(cachedUser));
    }
  }

  public saveUserToLocalStorage() {
    let attributes: any = this.attributes.getPlainAttributes();
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

  public updateUserData(urlBase?: string): Promise<void> {
    return new Promise((res, rej) => {
      const URLBase = urlBase ?? this.URLBase;
      if (!URLBase || URLBase === '') {
        return rej(new Error('No URLBase'));
      }
      const attributes: any = this.attributes.getPlainAttributes();
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
          this.setDataFromLocalStorage();
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

export class BaseUserAttributes extends CommonFields {
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

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.email = object.attributes.email ?? this.email;
      this.username = object.attributes.username ?? this.username;
      this.first_name = object.attributes.first_name ?? this.first_name;
      this.last_name = object.attributes.last_name ?? this.last_name;
      this.img_picture = object.attributes.img_picture ?? this.img_picture;
      this.theme = object.attributes.theme ?? this.theme;
      this.theme_color = object.attributes.theme_color ?? this.theme_color;
      this.profile_picture_shape =
        object.attributes.profile_picture_shape ?? this.profile_picture_shape;
      this.phone_number = object.attributes.phone_number ?? this.phone_number;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.email && {
        email: this.email,
      }),
      ...(this.username && {
        username: this.username,
      }),
      ...(this.first_name && {
        first_name: this.first_name,
      }),
      ...(this.last_name && {
        last_name: this.last_name,
      }),
      ...(this.img_picture && {
        img_picture: this.img_picture,
      }),
      ...(this.theme && {
        theme: this.theme,
      }),
      ...(this.theme_color && {
        theme_color: this.theme_color,
      }),
      ...(this.profile_picture_shape && {
        profile_picture_shape: this.profile_picture_shape,
      }),
      ...(this.phone_number && {
        phone_number: this.phone_number,
      }),
    };
  }

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
