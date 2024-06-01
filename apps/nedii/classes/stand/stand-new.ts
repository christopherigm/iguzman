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
  public _stand: Signal<{ data: Stand }> = signal({
    data: new Stand(),
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
