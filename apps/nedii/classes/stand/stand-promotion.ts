import { Signal, signal } from '@preact-signals/safe-react';
import { BasePicture, BasePictureAttributes, API } from '@repo/utils';
import Stand from 'classes/stand';

export default class StandPromotion extends BasePicture {
  public static instance: StandPromotion;
  public type = 'StandPromotion';
  public endpoint = 'v1/stand-promotions/';
  public attributes: StandPromotionAttributes = new StandPromotionAttributes();
  public relationships: StandPromotionRelationships =
    new StandPromotionRelationships();

  public static getInstance(): StandPromotion {
    return StandPromotion.instance || new StandPromotion();
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
    this.relationships.setRelationshipsFromPlainObject(object);
  }

  public getPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
      relationships: this.relationships.getPlainRelationships(),
    };
  }

  public save(): Promise<void> {
    return new Promise((res, rej) => {
      const url = `${this.URLBase}/${this.endpoint}`;
      const data = {
        url,
        jwt: this.access,
        data: this.getPlainObject(),
      };
      API.Post(data)
        .then((response) => {
          if (response.errors && response.errors.length) {
            return rej(response.errors);
          }
          this.id = response.data?.id ?? this.id;
          return res();
        })
        .catch((error) => rej(error));
    });
  }
}

class StandPromotionAttributes extends BasePictureAttributes {
  private _slug: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.slug = object.attributes.slug ?? this.slug;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.slug && {
        slug: this.slug,
      }),
    };
  }

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }
}

class StandPromotionRelationships {
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

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
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
    };
  }

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }
}

export const standPromotion = signal<StandPromotion>(
  StandPromotion.getInstance()
).value;
