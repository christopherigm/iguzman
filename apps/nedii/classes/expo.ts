import { Signal, signal } from '@preact-signals/safe-react';
import { API, BasePicture, BasePictureAttributes } from '@repo/utils';
import Category from 'classes/category';

export default class Expo extends BasePicture {
  public static instance: Expo;
  public type: string = 'Expo';
  public endpoint: string = 'v1/expos/';
  public attributes: ExpoAttributes = new ExpoAttributes();
  public relationships: ExpoRelationships = new ExpoRelationships();
  private _selected: Signal<boolean> = signal(false);

  public static getInstance(): Expo {
    return Expo.instance || new Expo();
  }

  public getExpos(categories: Array<number> = []): Promise<Array<Expo>> {
    return new Promise((res, rej) => {
      if (!this.URLBase) {
        return rej('No URLBase');
      }
      const url = `${this.URLBase}/${
        this.endpoint
      }?filter[categories__id__in]=${categories.join(',')}`;
      API.Get({ url })
        .then((response) => {
          const expos: Array<Expo> = [];
          response.data.map((rawExpo: any) => {
            const newExpo = new Expo();
            newExpo.setDataFromPlainObject(rawExpo);
            expos.push(newExpo);
          });
          res(expos);
        })
        .catch((e) => rej(e.toString()));
    });
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
  }

  public getPlainObject(): any {
    return {
      id: this.id,
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
    };
  }

  public getMinimumPlainObject(): any {
    return {
      id: this.id,
      type: this.type,
    };
  }

  public get selected() {
    return this._selected.value;
  }
  public set selected(value) {
    this._selected.value = value;
  }
}

class ExpoAttributes extends BasePictureAttributes {
  private _slug: Signal<string> = signal('');
  private _email: Signal<string> = signal('');
  private _is_real: Signal<boolean> = signal(false);

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.slug = object.attributes.slug ?? this.slug;
      this.email = object.attributes.email ?? this.email;
      this.is_real = object.attributes.is_real;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.slug && {
        slug: this.slug,
      }),
      ...(this.email && {
        email: this.email,
      }),
      is_real: this.is_real,
    };
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
  public _categories: Signal<{ data: Array<Category> }> = signal({ data: [] });

  public get categories() {
    return this._categories.value;
  }
  public set categories(value) {
    this._categories.value = value;
  }
}

export const expo = signal<Expo>(Expo.getInstance()).value;
