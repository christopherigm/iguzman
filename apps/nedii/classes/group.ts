import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';

export default class Group {
  public static instance: Group;
  protected type: string = 'Group';
  private _id: Signal<number> = signal(0);
  public attributes: GroupAttributes = new GroupAttributes();

  public static getInstance(): Group {
    return Group.instance || new Group();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class GroupAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _img_picture: Signal<string> = signal('');
  private _slug: Signal<string> = signal('');
  private _icon: Signal<string> = signal('');
  private _color: Signal<string> = signal('');

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

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }

  public get icon() {
    return this._icon.value;
  }
  public set icon(value) {
    this._icon.value = value;
  }

  public get color() {
    return this._color.value;
  }
  public set color(value) {
    this._color.value = value;
  }
}

export const group = signal<Group>(Group.getInstance()).value;
