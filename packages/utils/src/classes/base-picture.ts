import { Signal, signal } from '@preact/signals-react';
import CommonFields from './common-fields';

export class BasePicture {
  public static instance: BasePicture;
  public type: string = 'BasePicture';
  private _id: Signal<number> = signal(0);
  public attributes: BasePictureAttributes = new BasePictureAttributes();

  public static getInstance(): BasePicture {
    return BasePicture.instance || new BasePicture();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

export class BasePictureAttributes extends CommonFields {
  private _img_picture: Signal<string> = signal('');
  private _name: Signal<string> = signal('');
  private _description: Signal<string> = signal('');
  private _href: Signal<string> = signal('');
  private _full_size: Signal<boolean> = signal(false);

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
