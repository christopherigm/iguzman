import { Signal, signal } from '@preact/signals-react';
import { BasePictureAttributes } from 'utils';
import Stand from 'classes/stand';

export default class StandNew {
  public static instance: StandNew;
  protected type = 'StandNew';
  private _id: Signal<number> = signal(0);
  public attributes: StandNewAttributes = new StandNewAttributes();
  public relationships: StandNewRelationships = new StandNewRelationships();

  public static getInstance(): StandNew {
    return StandNew.instance || new StandNew();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandNewAttributes extends BasePictureAttributes {
  private _slug: Signal<string> = signal('');

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }
}

class StandNewRelationships {
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
