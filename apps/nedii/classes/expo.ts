import { Signal, signal } from '@preact-signals/safe-react';
import { API, RebuildData, CommonFields } from '@repo/utils';
import Group from 'classes/group';

export default class Expo {
  public static instance: Expo;
  protected type: string = 'Expo';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _selected: Signal<boolean> = signal(false);
  public attributes: ExpoAttributes = new ExpoAttributes();
  public relationships: ExpoRelationships = new ExpoRelationships();

  public static getInstance(): Expo {
    return Expo.instance || new Expo();
  }

  public getExpos(groups: Array<number> = []): Promise<Array<Expo>> {
    return new Promise((res, rej) => {
      if (!this.URLBase) {
        return rej('No URLBase');
      }
      const url = `${
        this.URLBase
      }/v1/expos/?filter[groups__id__in]=${groups.join(',')}`;
      API.Get({ url })
        .then((response) => {
          const expos: Array<Expo> = [];
          response.data.map((rawExpo: any) => {
            const newExpo = new Expo();
            newExpo.setAttributesFromPlainObject(rawExpo);
            expos.push(newExpo);
          });
          res(expos);
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

class ExpoAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _slug: Signal<string> = signal('');
  private _img_picture: Signal<string> = signal('');
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

  public get img_picture() {
    return this._img_picture.value;
  }
  public set img_picture(value) {
    this._img_picture.value = value;
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
