import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';
import BaseAPIClass from './base-class';

export class BasePicture extends BaseAPIClass {
  public static instance: BasePicture;
  public type: string = 'BasePicture';
  public endpoint = '';
  public attributes: BasePictureAttributes = new BasePictureAttributes();
  public relationships: any;

  public static getInstance(): BasePicture {
    return BasePicture.instance || new BasePicture();
  }
}

export class BasePictureAttributes extends CommonFields {
  private _img_picture: Signal<string> = signal('');
  private _name: Signal<string> = signal('');
  private _description: Signal<string> = signal('');
  private _href: Signal<string> = signal('');
  private _full_size: Signal<boolean> = signal(false);

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.img_picture = object.attributes.img_picture ?? this.img_picture;
      this.name = object.attributes.name ?? this.name;
      this.description = object.attributes.description ?? this.description;
      this.href = object.attributes.href ?? this.href;
      this.full_size = object.attributes.full_size;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.img_picture && {
        img_picture: this.img_picture,
      }),
      ...(this.name && {
        name: this.name,
      }),
      ...(this.description && {
        description: this.description,
      }),
      ...(this.href && {
        href: this.href,
      }),
      full_size: this.full_size,
    };
  }

  public get img_picture() {
    return this._img_picture.value;
  }
  public set img_picture(value) {
    this._img_picture.value = value;
  }

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get description() {
    return this._description.value;
  }
  public set description(value) {
    this._description.value = value;
  }

  public get href() {
    return this._href.value;
  }
  public set href(value) {
    this._href.value = value;
  }

  public get full_size() {
    return this._full_size.value;
  }
  public set full_size(value) {
    this._full_size.value = value;
  }
}
