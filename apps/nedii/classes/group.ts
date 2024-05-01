import { Signal, signal } from '@preact-signals/safe-react';
import { API, RebuildData, CommonFields } from '@repo/utils';

export default class Group {
  public static instance: Group;
  protected type: string = 'Group';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _selected: Signal<boolean> = signal(false);
  public attributes: GroupAttributes = new GroupAttributes();

  public static getInstance(): Group {
    return Group.instance || new Group();
  }

  public getGroups(): Promise<Array<Group>> {
    return new Promise((res, rej) => {
      if (!this.URLBase) {
        return rej('No URLBase');
      }
      const url = `${this.URLBase}/v1/groups/`;
      API.Get({ url })
        .then((response) => {
          const groups: Array<Group> = [];
          response.data.map((rawGroup: any) => {
            const newGroup = new Group();
            newGroup.setAttributesFromPlainObject(rawGroup);
            groups.push(newGroup);
          });
          res(groups);
        })
        .catch((e) => rej(e.toString()));
    });
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.name = object.attributes.name ?? this.attributes.name;
    this.attributes.img_picture =
      object.attributes.img_picture ?? this.attributes.img_picture;
    this.attributes.slug = object.attributes.slug ?? this.attributes.slug;
    this.attributes.icon = object.attributes.icon ?? this.attributes.icon;
    this.attributes.color = object.attributes.color ?? this.attributes.color;
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }

  public get URLBase() {
    return this._URLBase.value;
  }
  public set URLBase(value) {
    this._URLBase.value = value;
  }

  public get selected() {
    return this._selected.value;
  }
  public set selected(value) {
    this._selected.value = value;
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
