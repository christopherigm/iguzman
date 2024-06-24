import { Signal, signal } from '@preact-signals/safe-react';
import { BasePicture, API } from '@repo/utils';
import Product from 'classes/product/product';

export default class StandPromotion extends BasePicture {
  public static instance: StandPromotion;
  public type = 'StandPromotion';
  public endpoint = 'v1/stand-promotions/';
  public relationships: StandPromotionRelationships =
    new StandPromotionRelationships();

  public static getInstance(): StandPromotion {
    return StandPromotion.instance || new StandPromotion();
  }
}

class StandPromotionRelationships {
  public _stand: Signal<{
    data: {
      id: number;
      type: 'Stand';
    };
  }> = signal({
    data: {
      id: 0,
      type: 'Stand',
    },
  });
  public _product: Signal<{ data: Product }> = signal({
    data: new Product(),
  });
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

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
      }
      if (object.relationships.product?.data) {
        this.product.data.setDataFromPlainObject(object);
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.stand.data.id && {
        stand: {
          data: this.stand.data,
        },
      }),
      ...(this.product.data.id && {
        product: {
          data: this.product.data,
        },
      }),
    };
  }

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }

  public get product() {
    return this._product.value;
  }
  public set product(value) {
    this._product.value = value;
  }
}

export const standPromotion = signal<StandPromotion>(
  StandPromotion.getInstance()
).value;
