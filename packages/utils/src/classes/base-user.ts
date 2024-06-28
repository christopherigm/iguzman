import { Signal, signal } from '@preact-signals/safe-react';
import { SetLocalStorageData } from '../lib/local-storage';
import { DeleteCookie } from '../lib/cookie-handler';
import type { JWTPayload } from '../interfaces/jwt-interface';
import API from '../api';
import CommonFields from './common-fields';
import BaseAPIClass from './base-class';

export class BaseUser extends BaseAPIClass {
  public static instance: BaseUser;
  public type = 'User';
  public endpoint = 'v1/users/';
  public attributes: BaseUserAttributes = new BaseUserAttributes();
  public relationships: any;

  public static getInstance(): BaseUser {
    return BaseUser.instance || new BaseUser();
  }

  public saveJWTToLocalStorage() {
    SetLocalStorageData('jwt', JSON.stringify(this.jwt));
  }

  public deleteJWTFromLocalStorage() {
    SetLocalStorageData('jwt', '');
  }

  public setItemByIDFromAPI(): Promise<void> {
    return new Promise((res, rej) => {
      this.setURLParametersForWholeObject();
      super
        .setItemByIDFromAPI()
        .then(() => {
          this.saveLocalStorage();
          res();
        })
        .catch((e) => rej(e));
    });
  }

  public save(): Promise<any> {
    return new Promise((res, rej) => {
      super
        .save()
        .then(() => res(this.setItemByIDFromAPI()))
        .catch((e) => rej(e));
    });
  }

  public login(): Promise<void> {
    return new Promise((res, rej) => {
      if (!this.URLBase || this.URLBase === '') {
        return rej(new Error('No URL Base'));
      }
      if (!this.attributes.email || !this.attributes.password) {
        return rej(new Error('No credentials'));
      }
      API.Login({
        URLBase: this.URLBase,
        attributes: {
          username: this.attributes.email,
          password: this.attributes.password,
        },
      })
        .then((data: JWTPayload) => {
          this.jwt = data;
          this.id = Number(data.user_id);
          this.saveJWTToLocalStorage();
          return this.setItemByIDFromAPI();
        })
        .then(() => res())
        .catch((error) => rej(error));
    });
  }

  public refreshToken(): Promise<void> {
    return new Promise((res, rej) => {
      this.setDataFromLocalStorage();
      if (!this.URLBase || this.URLBase === '') {
        return res();
      } else if (this.id && !this.jwt.refresh) {
        this.deleteJWTFromLocalStorage();
        this.deleteLocalStorage();
        return rej('not-valid-user');
      } else if (!this.jwt.refresh) {
        return rej('no-refresh-token');
      }
      const url = `${this.URLBase}/v1/token/refresh/`;
      const data = {
        type: 'TokenRefreshView',
        attributes: {
          refresh: this.jwt.refresh,
        },
      };
      API.Post({
        url,
        data,
      })
        .then((response: any) => {
          if (response.errors && response.errors.length) {
            if (response.errors[0].code === 'token_not_valid') {
              this.deleteJWTFromLocalStorage();
              this.deleteLocalStorage();
              DeleteCookie('User');
            }
            return rej(response.errors);
          }
          const newAccessToken = String(response.data.access || '');
          this.jwt.access = newAccessToken;
          this.saveJWTToLocalStorage();
          res();
        })
        .catch((error) => rej(error));
    });
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
      this.password = object.attributes.password ?? this.password;
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
      ...(this.password && {
        password: this.password,
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
