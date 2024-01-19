import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, City } from '@repo/utils';
import { Company } from 'classes/company';

export class UserJob {
  public static instance: UserJob;
  public type = 'UserJob';
  private _id: Signal<number> = signal(0);
  public attributes: UserJobAttributes = new UserJobAttributes();
  public relationships: UserJobRelationships = new UserJobRelationships();

  public static getInstance(): UserJob {
    return UserJob.instance || new UserJob();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.full_time =
      object.attributes?.full_time ?? this.attributes.full_time;
    this.attributes.contractor =
      object.attributes?.contractor ?? this.attributes.contractor;
    this.attributes.job_title =
      object.attributes?.job_title ?? this.attributes.job_title;
    this.attributes.currently_working_here =
      object.attributes?.currently_working_here ??
      this.attributes.currently_working_here;
    this.attributes.start_date =
      object.attributes?.start_date ?? this.attributes.start_date;
    this.attributes.end_date =
      object.attributes?.end_date ?? this.attributes.end_date;
    this.attributes.description =
      object.attributes?.description ?? this.attributes.description;
    this.attributes.job_url =
      object.attributes?.job_url ?? this.attributes.job_url;
    // Relationships
    if (object.relationships?.city.data) {
      this.relationships.city.data.setAttributesFromPlainObject(
        object.relationships?.city?.data
      );
    }
    if (object.relationships?.company.data) {
      this.relationships.company.data.setAttributesFromPlainObject(
        object.relationships?.company?.data
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

export class UserJobAttributes extends CommonFields {
  private _full_time: Signal<boolean> = signal(false);
  private _contractor: Signal<boolean> = signal(false);
  private _job_title: Signal<string> = signal('');
  private _currently_working_here: Signal<boolean> = signal(false);
  private _start_date: Signal<Date | null> = signal(null);
  private _end_date: Signal<Date | null> = signal(null);
  private _description: Signal<string> = signal('');
  private _job_url: Signal<string> = signal('');

  public get full_time() {
    return this._full_time.value;
  }
  public set full_time(value) {
    this._full_time.value = value;
  }

  public get contractor() {
    return this._contractor.value;
  }
  public set contractor(value) {
    this._contractor.value = value;
  }

  public get job_title() {
    return this._job_title.value;
  }
  public set job_title(value) {
    this._job_title.value = value;
  }

  public get currently_working_here() {
    return this._currently_working_here.value;
  }
  public set currently_working_here(value) {
    this._currently_working_here.value = value;
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

  public get job_url() {
    return this._job_url.value;
  }
  public set job_url(value) {
    this._job_url.value = value;
  }
}

class UserJobRelationships {
  public _city: Signal<{ data: City }> = signal({
    data: City.getInstance(),
  });
  public _company: Signal<{ data: Company }> = signal({
    data: Company.getInstance(),
  });

  public get city() {
    return this._city.value;
  }
  public set city(value) {
    this._city.value = value;
  }

  public get company() {
    return this._company.value;
  }
  public set company(value) {
    this._company.value = value;
  }
}

export const userJob = signal<UserJob>(UserJob.getInstance()).value;
