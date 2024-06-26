import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, BaseAPIClass, API, RebuildData } from '@repo/utils';
import type { DropDownFieldOption } from '@repo/ui';
import ProductFeature from 'classes/product/product-feature';

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

  public getItems(): Promise<Array<ProductFeatureOption>> {
    return new Promise((res, rej) => {
      if (!this.relationships.feature.data.id) {
        return res([]);
      }
      let url = `${this.URLBase}/${this.endpoint}`;
      url += `?filter[feature]=${this.relationships.feature.data.id}`;
      url += '&include=feature';
      url += '&page[size]=1000';
      API.Get({
        url,
        jwt: this.jwt.access,
      })
        .then((response: { data: Array<any> }) => {
          const data = RebuildData(response);
          const newOptions = data.data.map((i: any) => {
            const newItem = new ProductFeatureOption();
            newItem.setDataFromPlainObject(i);
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
          const newOptions = items.map((i: any) => {
            let name = `[${i.relationships.feature.data.attributes.name}]`;
            name += ': ';
            name += i.attributes.name;
            const newItem: DropDownFieldOption = {
              id: i.id,
              name,
            };
            return newItem;
          });
          res(newOptions);
        })
        .catch((e: any) => rej(e));
    });
  }

  public updateParentOptions(): Promise<ProductFeature> {
    return new Promise((res, rej) => {
      if (!this.relationships.feature.data.id) {
        return rej('no-parent-id');
      }
      const parent = new ProductFeature();
      parent.id = this.relationships.feature.data.id;
      parent
        .setItemByIDFromAPI()
        .then(() => {
          parent.relationships.addOptionFromPlainObject(this.getPlainObject());
          parent
            .save()
            .then(() => res(parent))
            .catch((e) => rej(e));
        })
        .catch((e) => rej(e));
    });
  }

  public save(): Promise<any> {
    return new Promise((res, rej) => {
      super
        .save()
        .then((data) => {
          this.updateParentOptions()
            .then(() => res(data))
            .catch((e) => rej(e));
        })
        .catch((e) => rej(e));
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
  public _feature: Signal<{ data: ProductFeature }> = signal({
    data: ProductFeature.getInstance(),
  });

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.feature?.data) {
        this.feature.data.setDataFromPlainObject(
          object.relationships.feature.data
        );
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.feature.data.id && {
        feature: {
          data: this.feature.data.getPlainObject(),
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
