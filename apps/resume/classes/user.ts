import { Signal, signal } from '@preact-signals/safe-react';
import {
  API,
  BaseUser,
  BaseUserAttributes,
  GetLocalStorageData,
} from '@repo/utils';

export default class User extends BaseUser {
  public static instance: User;
  public attributes: UserAttributes = new UserAttributes();

  public static getInstance(): User {
    return User.instance || new User();
  }

  public setResumeUserAttributesFromPlainObject(object: any) {
    this.setUserAttributesFromPlainObject(object ?? {});
    this.attributes.open_to_work =
      object?.attributes?.open_to_work ?? this.attributes.open_to_work;
    this.attributes.listening_offers =
      object?.attributes?.listening_offers ?? this.attributes.listening_offers;
    this.attributes.willing_to_comute =
      object?.attributes?.willing_to_comute ??
      this.attributes.willing_to_comute;
    this.attributes.public =
      object?.attributes?.public ?? this.attributes.public;
    this.attributes.listed =
      object?.attributes?.listed ?? this.attributes.listed;
    this.attributes.published =
      object?.attributes?.published ?? this.attributes.published;
    this.attributes.display_email =
      object?.attributes?.display_email ?? this.attributes.display_email;
    this.attributes.headline =
      object?.attributes?.headline ?? this.attributes.headline;
    this.attributes.biography =
      object?.attributes?.biography ?? this.attributes.biography;
    this.attributes.legal_name =
      object?.attributes?.legal_name ?? this.attributes.legal_name;
    this.attributes.birthday =
      object?.attributes?.birthday ?? this.attributes.birthday;
    this.attributes.linkedin =
      object?.attributes?.linkedin ?? this.attributes.linkedin;
    this.attributes.github =
      object?.attributes?.github ?? this.attributes.github;
    this.attributes.img_hero_picture =
      object?.attributes?.img_hero_picture ?? this.attributes.img_hero_picture;
    this.attributes.years_of_experience =
      object?.attributes?.years_of_experience ??
      this.attributes.years_of_experience;
  }

  public getResumeUserFromLocalStorage() {
    this.getUserFromLocalStorage();
    let cachedUser: any = GetLocalStorageData(this.type);
    if (cachedUser) {
      cachedUser = JSON.parse(cachedUser);
    }
  }

  public getResumePlainAttributes(): Object {
    return {
      ...this.getPlainAttributes(),
      token: this.attributes.token,
      open_to_work: this.attributes.open_to_work,
      listening_offers: this.attributes.listening_offers,
      willing_to_comute: this.attributes.willing_to_comute,
      public: this.attributes.public,
      listed: this.attributes.listed,
      published: this.attributes.published,
      display_email: this.attributes.display_email,
      headline: this.attributes.headline,
      biography: this.attributes.biography,
      legal_name: this.attributes.legal_name,
      birthday: this.attributes.birthday
        ? this.attributes.birthday.toString()
        : '',
      linkedin: this.attributes.linkedin,
      github: this.attributes.github,
      img_hero_picture: this.attributes.img_hero_picture,
      years_of_experience: this.attributes.years_of_experience,
    };
  }

  public getUserFromAPI(urlBase?: string): Promise<any> {
    return new Promise((res, rej) => {
      const URLBase = urlBase ?? this.URLBase;
      if (!URLBase || URLBase === '') {
        return rej(new Error('No URL Base'));
      }
      if (this.id) {
        API.GetUser({
          URLBase,
          jwt: '',
          userID: this.id,
        })
          .then((data: any) => res(data))
          .catch((error) => rej(error));
      } else if (this.attributes.username) {
        const url = `${URLBase}/v1/users/?filter[username]=${this.attributes.username}`;
        API.Get({ url })
          .then((response) => res(response.data.length ? response.data[0] : {}))
          .catch((error) => rej(error));
      } else {
        rej('No user id or username');
      }
    });
  }
}

class UserAttributes extends BaseUserAttributes {
  private _token: Signal<string> = signal('');
  private _open_to_work: Signal<boolean> = signal(false);
  private _listening_offers: Signal<boolean> = signal(false);
  private _willing_to_comute: Signal<boolean> = signal(false);
  private _public: Signal<boolean> = signal(false);
  private _listed: Signal<boolean> = signal(false);
  private _published: Signal<boolean> = signal(false);
  private _display_email: Signal<boolean> = signal(false);
  private _headline: Signal<string> = signal('');
  private _biography: Signal<string> = signal('');
  private _legal_name: Signal<string> = signal('');
  private _birthday: Signal<Date> = signal(new Date());
  private _linkedin: Signal<string> = signal('');
  private _github: Signal<string> = signal('');
  private _img_hero_picture: Signal<string> = signal('');
  private _years_of_experience: Signal<number> = signal(0);

  public get token() {
    return this._token.value;
  }
  public set token(value) {
    this._token.value = value;
  }

  public get open_to_work() {
    return this._open_to_work.value;
  }
  public set open_to_work(value) {
    this._open_to_work.value = value;
  }

  public get listening_offers() {
    return this._listening_offers.value;
  }
  public set listening_offers(value) {
    this._listening_offers.value = value;
  }

  public get willing_to_comute() {
    return this._willing_to_comute.value;
  }
  public set willing_to_comute(value) {
    this._willing_to_comute.value = value;
  }

  public get public() {
    return this._public.value;
  }
  public set public(value) {
    this._public.value = value;
  }

  public get listed() {
    return this._listed.value;
  }
  public set listed(value) {
    this._listed.value = value;
  }

  public get published() {
    return this._published.value;
  }
  public set published(value) {
    this._published.value = value;
  }

  public get display_email() {
    return this._display_email.value;
  }
  public set display_email(value) {
    this._display_email.value = value;
  }

  public get headline() {
    return this._headline.value;
  }
  public set headline(value) {
    this._headline.value = value;
  }

  public get biography() {
    return this._biography.value;
  }
  public set biography(value) {
    this._biography.value = value;
  }

  public get legal_name() {
    return this._legal_name.value;
  }
  public set legal_name(value) {
    this._legal_name.value = value;
  }

  public get birthday() {
    return this._birthday.value;
  }
  public set birthday(value) {
    this._birthday.value = value;
  }

  public get linkedin() {
    return this._linkedin.value;
  }
  public set linkedin(value) {
    this._linkedin.value = value;
  }

  public get github() {
    return this._github.value;
  }
  public set github(value) {
    this._github.value = value;
  }

  public get img_hero_picture() {
    return this._img_hero_picture.value;
  }
  public set img_hero_picture(value) {
    this._img_hero_picture.value = value;
  }

  public get years_of_experience() {
    return this._years_of_experience.value;
  }
  public set years_of_experience(value) {
    this._years_of_experience.value = value;
  }
}

export const user = signal<User>(User.getInstance()).value;
