import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';

export class SkillCategory {
  public static instance: SkillCategory;
  public type = 'SkillCategory';
  private _id: Signal<number> = signal(0);
  public attributes: SkillCategoryAttributes = new SkillCategoryAttributes();

  public static getInstance(): SkillCategory {
    return SkillCategory.instance || new SkillCategory();
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

export class SkillCategoryAttributes extends CommonFields {
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

export const skillCategory = signal<SkillCategory>(
  SkillCategory.getInstance()
).value;
