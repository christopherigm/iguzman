import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, BaseAPIClass, API } from '@repo/utils';
import ProductFeatureOption from 'classes/product/product-feature-option';

export default class ProductFeature extends BaseAPIClass {
  public static instance: ProductFeature;
  public type = 'ProductFeature';
  public endpoint = 'v1/product-features/';
  public attributes: ProductFeatureAttributes = new ProductFeatureAttributes();
  public relationships: ProductFeatureRelationships =
    new ProductFeatureRelationships();

  public static getInstance(): ProductFeature {
    return ProductFeature.instance || new ProductFeature();
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

class ProductFeatureAttributes extends CommonFields {
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

class ProductFeatureRelationships {
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
  public _options: Signal<{ data: Array<ProductFeatureOption> }> = signal({
    data: [],
  });

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
      }
      if (object.relationships.options?.data) {
        const newArray: Array<ProductFeatureOption> = [];
        object.relationships.options.data.map((i: any) => {
          const newOption = new ProductFeatureOption();
          newOption.setDataFromPlainObject(i);
          newArray.push(newOption);
        });
        this.options.data = [...newArray];
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
      ...(this.options.data.length && {
        options: {
          data: this.options.data.map((i) => i.getPlainObject()),
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

  public get options() {
    return this._options.value;
  }
  public set options(value) {
    this._options.value = value;
  }
}

export const productFeature = signal<ProductFeature>(
  ProductFeature.getInstance()
).value;
