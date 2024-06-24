import { Signal, signal } from '@preact-signals/safe-react';
import { BaseAPIClass, BasePictureAttributes, API } from '@repo/utils';
import Stand from 'classes/stand';

export default class StandNew extends BaseAPIClass {
  public static instance: StandNew;
  public type = 'StandNew';
  public endpoint = 'v1/product-news/';
  public attributes: StandNewAttributes = new StandNewAttributes();
  public relationships: StandNewRelationships = new StandNewRelationships();

  public static getInstance(): StandNew {
    return StandNew.instance || new StandNew();
  }
}

class StandNewAttributes extends BasePictureAttributes {
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

class StandNewRelationships {
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

  public setRelationshipsFromPlainObject(object: any) {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.stand.data.id && {
        stand: this.stand,
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

export const standNew = signal<StandNew>(StandNew.getInstance()).value;
