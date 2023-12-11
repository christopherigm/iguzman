import { Signal, signal } from '@preact/signals-react';
import { BasePictureAttributes } from 'utils';
import Stand from 'classes/stand';

export default class StandPicture {
  public static instance: StandPicture;
  protected type = 'StandPicture';
  private _id: Signal<number> = signal(0);
  public attributes: BasePictureAttributes = new BasePictureAttributes();
  public relationships: StandPictureRelationships =
    new StandPictureRelationships();

  public static getInstance(): StandPicture {
    return StandPicture.instance || new StandPicture();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandPictureRelationships {
  public _stand: Signal<{ data: Stand }> = signal({
    data: new Stand(),
  });

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }
}
