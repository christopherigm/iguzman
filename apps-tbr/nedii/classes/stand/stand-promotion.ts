import { Signal, signal } from '@preact/signals-react';
import { BasePictureAttributes } from 'utils';
import Stand from 'classes/stand';

export default class StandPromotion {
  public static instance: StandPromotion;
  protected type = 'StandPromotion';
  private _id: Signal<number> = signal(0);
  public attributes: StandPromotionAttributes = new StandPromotionAttributes();
  public relationships: StandPromotionRelationships =
    new StandPromotionRelationships();

  public static getInstance(): StandPromotion {
    return StandPromotion.instance || new StandPromotion();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandPromotionAttributes extends BasePictureAttributes {
  private _slug: Signal<string> = signal('');

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }
}

class StandPromotionRelationships {
  public _stand: Signal<{ data: Stand }> = signal({
    data: new Stand(),
  });
  // public _product: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });
  // public _service: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });
  // public _meal: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });
  // public _real_estate: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });
  // public _vehicle: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }
}
