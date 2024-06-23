import { Signal, signal } from '@preact-signals/safe-react';
import {
  CommonFields,
  BaseAPIClass,
  API,
  removeImagesForAPICall,
  RebuildData,
} from '@repo/utils';
import type { DropDownFieldOption } from '@repo/ui';
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

  public getItems(): Promise<Array<ProductFeature>> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/${this.endpoint}`;
      url += `?filter[stand]=${this.relationships.stand.data.id}`;
      url += '&include=options';
      url += '&page[size]=1000';
      API.Get({
        url,
        jwt: this.access,
      })
        .then((response: { data: Array<any> }) => {
          const data = RebuildData(response);
          const newOptions = data.data.map((i: any) => {
            const newItem = new ProductFeature();
            newItem.setDataFromPlainObject(i);
            newItem.URLBase = this.URLBase;
            newItem.access = this.access;
            newItem.relationships.stand.data.id =
              this.relationships.stand.data.id;
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
        .then((items: Array<ProductFeature>) => {
          const newOptions = items.map((i: ProductFeature) => {
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

  public save(): Promise<any> {
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
      options: {
        data: this.options.data.length
          ? this.options.data.map((i) => i.getPlainObject())
          : [],
      },
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
