import { Signal, signal } from '@preact-signals/safe-react';
import {
  API,
  RebuildData,
  BaseUser,
  BaseUserAttributes,
  GetLocalStorageData,
  City,
} from '@repo/utils';
import { UserJob } from 'classes/user-job';
import { UserSchool } from 'classes/user-school';
import { UserSkill } from 'classes/user-skill';

export default class User extends BaseUser {
  public static instance: User;
  public attributes: UserAttributes = new UserAttributes();
  public relationships: UserRelationships = new UserRelationships();
  public _jobs: Signal<Array<UserJob>> = signal([]);
  public _schools: Signal<Array<UserSchool>> = signal([]);
  public _skills: Signal<Array<UserSkill>> = signal([]);

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
    // Relationships
    if (object.relationships?.city?.data) {
      this.relationships.city.data.setAttributesFromPlainObject(
        object.relationships?.city?.data
      );
    }
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
        url += '&include=city,city.state,city.state.country';
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

  public getUserJobsFromAPI(urlBase?: string): Promise<any> {
    return new Promise((res, rej) => {
      this.URLBase = urlBase ?? this.URLBase;
      if (!this.URLBase || !this.id) {
        return rej(new Error('No URL Base'));
      }
      let url = `${this.URLBase}/v1/user-jobs/?filter[user]=${this.id}`;
      url += '&include=company,city,city.state,city.state.country';
      url += '&sort=-start_date';
      API.Get({
        url,
        jwt: '',
      })
        .then((response: any) => {
          this.jobs = [];
          const data: Array<any> = RebuildData(response).data;
          data.forEach((i: any) => {
            const job = new UserJob();
            job.setAttributesFromPlainObject(i);
            this.jobs.push(job);
          });
          this.jobs = [...this.jobs];
          res(data);
        })
        .catch((error) => {
          console.log(error);
          rej(error);
        });
    });
  }

  public getUserSchoolsFromAPI(urlBase?: string): Promise<any> {
    return new Promise((res, rej) => {
      this.URLBase = urlBase ?? this.URLBase;
      if (!this.URLBase || !this.id) {
        return rej(new Error('No URL Base'));
      }
      let url = `${this.URLBase}/v1/user-schools/?filter[user]=${this.id}`;
      url += '&include=school,city,city.state,city.state.country';
      url += '&sort=-start_date';
      API.Get({
        url,
        jwt: '',
      })
        .then((response: any) => {
          this.schools = [];
          const data: Array<any> = RebuildData(response).data;
          data.forEach((i: any) => {
            const school = new UserSchool();
            school.setAttributesFromPlainObject(i);
            this.schools.push(school);
          });
          this.schools = [...this.schools];
          res(data);
        })
        .catch((error) => {
          console.log(error);
          rej(error);
        });
    });
  }

  public getUserSkillsFromAPI(urlBase?: string): Promise<any> {
    return new Promise((res, rej) => {
      this.URLBase = urlBase ?? this.URLBase;
      if (!this.URLBase || !this.id) {
        return rej(new Error('No URL Base'));
      }
      let url = `${this.URLBase}/v1/user-skills/?filter[user]=${this.id}`;
      url += '&include=skill,skill.category';
      url += '&page[number]=1&page[size]=200';
      API.Get({
        url,
        jwt: '',
      })
        .then((response: any) => {
          this.skills = [];
          const data: Array<any> = RebuildData(response).data;
          data.forEach((i: any) => {
            const skill = new UserSkill();
            skill.setAttributesFromPlainObject(i);
            this.skills.push(skill);
          });
          this.skills = [...this.skills];
          res(data);
        })
        .catch((error) => {
          console.log(error);
          rej(error);
        });
    });
  }

  public get jobs() {
    return this._jobs.value;
  }
  public set jobs(value) {
    this._jobs.value = value;
  }

  public get schools() {
    return this._schools.value;
  }
  public set schools(value) {
    this._schools.value = value;
  }

  public get skills() {
    return this._skills.value;
  }
  public set skills(value) {
    this._skills.value = value;
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

class UserRelationships {
  public _city: Signal<{ data: City }> = signal({
    data: City.getInstance(),
  });

  public get city() {
    return this._city.value;
  }
  public set city(value) {
    this._city.value = value;
  }
}

export const user = signal<User>(User.getInstance()).value;
