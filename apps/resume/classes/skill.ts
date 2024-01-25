import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';
import { SkillCategory } from 'classes/skill-category';

export class Skill {
  public static instance: Skill;
  public type = 'Skill';
  private _id: Signal<number> = signal(0);
  public attributes: SkillAttributes = new SkillAttributes();
  public relationships: SkillRelationships = new SkillRelationships();

  public static getInstance(): Skill {
    return Skill.instance || new Skill();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.name = object.attributes?.name ?? this.attributes.name;
    this.attributes.img_picture =
      object.attributes?.img_picture ?? this.attributes.img_picture;
    // Relationships
    if (object.relationships?.category.data) {
      this.relationships.category.data.setAttributesFromPlainObject(
        object.relationships?.category?.data
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

export class SkillAttributes extends CommonFields {
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

class SkillRelationships {
  public _category: Signal<{ data: SkillCategory }> = signal({
    data: SkillCategory.getInstance(),
  });

  public get category() {
    return this._category.value;
  }
  public set category(value) {
    this._category.value = value;
  }
}

export const skill = signal<Skill>(Skill.getInstance()).value;
