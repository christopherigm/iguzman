import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';
import Group from 'classes/group';

export default class Expo {
  public static instance: Expo;
  protected type: string = 'Expo';
  private _id: Signal<number> = signal(0);
  public attributes: ExpoAttributes = new ExpoAttributes();
  public relationships: ExpoRelationships = new ExpoRelationships();

  public static getInstance(): Expo {
    return Expo.instance || new Expo();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class ExpoAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _slug: Signal<string> = signal('');
  private _email: Signal<string> = signal('');
  private _is_real: Signal<boolean> = signal(false);

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }

  public get email() {
    return this._email.value;
  }
  public set email(value) {
    this._email.value = value;
  }

  public get is_real() {
    return this._is_real.value;
  }
  public set is_real(value) {
    this._is_real.value = value;
  }
}

class ExpoRelationships {
  public _groups: Signal<{ data: Array<Group> }> = signal({ data: [] });

  public get groups() {
    return this._groups.value;
  }
  public set groups(value) {
    this._groups.value = value;
  }
}

export const expo = signal<Expo>(Expo.getInstance()).value;
