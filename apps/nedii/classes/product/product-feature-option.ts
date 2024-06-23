import { Signal, signal } from '@preact-signals/safe-react';
import {
  CommonFields,
  BaseAPIClass,
  API,
  removeImagesForAPICall,
} from '@repo/utils';
import type { DropDownFieldOption } from '@repo/ui';

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

  public getItems(): Promise<Array<ProductFeatureOption>> {
    return new Promise((res, rej) => {
      if (!this.relationships.feature.data.id) {
        return res([]);
      }
      let url = `${this.URLBase}/${this.endpoint}`;
      url += `?filter[feature]=${this.relationships.feature.data.id}`;
      url += '&page[size]=1000';
      API.Get({
        url,
        jwt: this.access,
      })
        .then((response: { data: Array<any> }) => {
          const newOptions = response.data.map((i: any) => {
            const newItem = new ProductFeatureOption();
            newItem.setDataFromPlainObject(i);
            newItem.URLBase = this.URLBase;
            newItem.access = this.access;
            newItem.relationships.feature.data.id =
              this.relationships.feature.data.id;
            return newItem;
          });
          res(newOptions);
        })
        .catch((e: any) => rej(e));
    });
  }

  public getDropDownItems(): Promise<Array<DropDownFieldOption>> {
    return new Promise((res, rej) => {
      this.getItems()
        .then((items: Array<ProductFeatureOption>) => {
          const newOptions = items.map((i: ProductFeatureOption) => {
            const newItem: DropDownFieldOption = {
              id: i.id,
              name: i.attributes.name,
            };
            return newItem;
          });
          res(newOptions);
        })
        .catch((e: any) => rej(e));
    });
  }

  public save(): Promise<void> {
    return new Promise((res, rej) => {
      const url = `${this.URLBase}/${this.endpoint}${
        this.id ? `${this.id}/` : ''
      }`;
      const data = {
        url,
        jwt: this.access,
        data: this.getPlainObject(),
      };
      removeImagesForAPICall(data.data.attributes);
      const method = this.id ? API.Patch : API.Post;
      method(data)
        .then((response) => {
          if (response.errors && response.errors.length) {
            return rej(response.errors);
          }
          this.id = Number(response.data?.id ?? this.id);
          return res(response);
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
      if (object.relationships.feature?.data) {
        this.feature.data.id = object.relationships.feature.data.id;
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.feature.data.id && {
        feature: {
          data: this.feature.data,
        },
      }),
    };
  }

  public get feature() {
    return this._feature.value;
  }
  public set feature(value) {
    this._feature.value = value;
  }
}

export const productFeatureOption = signal<ProductFeatureOption>(
  ProductFeatureOption.getInstance()
).value;
