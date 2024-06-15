import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, BaseAPIClass, API } from '@repo/utils';

export default class ProductFeatureOption extends BaseAPIClass {
  public static instance: ProductFeatureOption;
  public type = 'ProductFeatureOption';
  public endpoint = 'v1/product-feature-options/';
  public attributes: ProductFeatureOptionAttributes =
    new ProductFeatureOptionAttributes();
  public relationships: ProductFeatureOptionRelationships =
    new ProductFeatureOptionRelationships();

  public static getInstance(): ProductFeatureOption {
    return ProductFeatureOption.instance || new ProductFeatureOption();
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
          this.id = Number(response.data?.id ?? this.id);
          return res();
        })
        .catch((error) => rej(error));
    });
  }
}

class ProductFeatureOptionAttributes extends CommonFields {
  private _name: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.name = object.attributes.name ?? this.name;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.name && {
        name: this.name,
      }),
    };
  }

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }
}

class ProductFeatureOptionRelationships {
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
  public _feature: Signal<{
    data: {
      id: number;
      type: 'ProductFeature';
    };
  }> = signal({
    data: {
      id: 0,
      type: 'ProductFeature',
    },
  });

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
      }
      if (object.relationships.feature?.data) {
        this.feature.data.id = object.relationships.feature.data.id;
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
      ...(this.feature.data.id && {
        feature: {
          data: this.feature.data,
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

  public get feature() {
    return this._feature.value;
  }
  public set feature(value) {
    this._feature.value = value;
  }
}

export const productFeature = signal<ProductFeatureOption>(
  ProductFeatureOption.getInstance()
).value;
