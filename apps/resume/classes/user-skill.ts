import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';
import { Skill } from 'classes/skill';

export class UserSkill {
  public static instance: UserSkill;
  public type = 'UserSkill';
  private _id: Signal<number> = signal(0);
  public attributes: UserSkillAttributes = new UserSkillAttributes();
  public relationships: UserSkillRelationships = new UserSkillRelationships();

  public static getInstance(): UserSkill {
    return UserSkill.instance || new UserSkill();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    // Attributes
    this.attributes.percentage =
      object.attributes?.percentage ?? this.attributes.percentage;
    this.attributes.years_of_experience =
      object.attributes?.years_of_experience ??
      this.attributes.years_of_experience;
    // Relationships
    if (object.relationships?.skill.data) {
      this.relationships.skill.data.setAttributesFromPlainObject(
        object.relationships?.skill?.data
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

export class UserSkillAttributes extends CommonFields {
  private _percentage: Signal<number> = signal(0);
  private _years_of_experience: Signal<number> = signal(0);

  public get percentage() {
    return this._percentage.value;
  }
  public set percentage(value) {
    this._percentage.value = value;
  }

  public get years_of_experience() {
    return this._years_of_experience.value;
  }
  public set years_of_experience(value) {
    this._years_of_experience.value = value;
  }
}

class UserSkillRelationships {
  public _skill: Signal<{ data: Skill }> = signal({
    data: Skill.getInstance(),
  });

  public get skill() {
    return this._skill.value;
  }
  public set skill(value) {
    this._skill.value = value;
  }
}

export const skill = signal<Skill>(Skill.getInstance()).value;
