import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';

export class School {
  public static instance: School;
  public type = 'School';
  private _id: Signal<number> = signal(0);
  public attributes: SchoolAttributes = new SchoolAttributes();

  public static getInstance(): School {
    return School.instance || new School();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.name = object.attributes?.name ?? this.attributes.name;
    this.attributes.img_picture =
      object.attributes?.img_picture ?? this.attributes.img_picture;
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

export class SchoolAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _img_picture: Signal<string> = signal('');

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get img_picture() {
    return this._img_picture.value;
  }
  public set img_picture(value) {
    this._img_picture.value = value;
  }
}

export const school = signal<School>(School.getInstance()).value;
