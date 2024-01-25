import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, City } from '@repo/utils';
import { School } from 'classes/school';

export class UserSchool {
  public static instance: UserSchool;
  public type = 'UserSchool';
  private _id: Signal<number> = signal(0);
  public attributes: UserSchoolAttributes = new UserSchoolAttributes();
  public relationships: UserSchoolRelationships = new UserSchoolRelationships();

  public static getInstance(): UserSchool {
    return UserSchool.instance || new UserSchool();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.degree =
      object.attributes?.degree ?? this.attributes.degree;
    this.attributes.field_of_study =
      object.attributes?.field_of_study ?? this.attributes.field_of_study;
    this.attributes.currently_studiying_here =
      object.attributes?.currently_studiying_here ??
      this.attributes.currently_studiying_here;
    this.attributes.start_date =
      object.attributes?.start_date ?? this.attributes.start_date;
    this.attributes.end_date =
      object.attributes?.end_date ?? this.attributes.end_date;
    this.attributes.description =
      object.attributes?.description ?? this.attributes.description;
    this.attributes.school_url =
      object.attributes?.school_url ?? this.attributes.school_url;
    // Relationships
    if (object.relationships?.city.data) {
      this.relationships.city.data.setAttributesFromPlainObject(
        object.relationships?.city?.data
      );
    }
    if (object.relationships?.school.data) {
      this.relationships.school.data.setAttributesFromPlainObject(
        object.relationships?.school?.data
      );
    }
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

export class UserSchoolAttributes extends CommonFields {
  private _degree: Signal<string> = signal('');
  private _field_of_study: Signal<string> = signal('');
  private _currently_studiying_here: Signal<boolean> = signal(false);
  private _start_date: Signal<Date | null> = signal(null);
  private _end_date: Signal<Date | null> = signal(null);
  private _description: Signal<string> = signal('');
  private _school_url: Signal<string> = signal('');

  public get degree() {
    return this._degree.value;
  }
  public set degree(value) {
    this._degree.value = value;
  }

  public get field_of_study() {
    return this._field_of_study.value;
  }
  public set field_of_study(value) {
    this._field_of_study.value = value;
  }

  public get currently_studiying_here() {
    return this._currently_studiying_here.value;
  }
  public set currently_studiying_here(value) {
    this._currently_studiying_here.value = value;
  }

  public get start_date() {
    return this._start_date.value;
  }
  public set start_date(value) {
    this._start_date.value = value;
  }

  public get end_date() {
    return this._end_date.value;
  }
  public set end_date(value) {
    this._end_date.value = value;
  }

  public get description() {
    return this._description.value;
  }
  public set description(value) {
    this._description.value = value;
  }

  public get school_url() {
    return this._school_url.value;
  }
  public set school_url(value) {
    this._school_url.value = value;
  }
}

class UserSchoolRelationships {
  public _city: Signal<{ data: City }> = signal({
    data: City.getInstance(),
  });
  public _school: Signal<{ data: School }> = signal({
    data: School.getInstance(),
  });

  public get city() {
    return this._city.value;
  }
  public set city(value) {
    this._city.value = value;
  }

  public get school() {
    return this._school.value;
  }
  public set school(value) {
    this._school.value = value;
  }
}

export const userSchool = signal<UserSchool>(UserSchool.getInstance()).value;
