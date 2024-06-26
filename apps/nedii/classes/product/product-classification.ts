import { Signal, signal } from '@preact-signals/safe-react';
import {
  BasePicture,
  API,
  removeImagesForAPICall,
  RebuildData,
} from '@repo/utils';
import type { DropDownFieldOption } from '@repo/ui';

export default class ProductClassification extends BasePicture {
  public static instance: ProductClassification;
  public type = 'ProductClassification';
  public endpoint = 'v1/product-classifications/';
  public relationships: ProductClassificationRelationships =
    new ProductClassificationRelationships();

  public static getInstance(): ProductClassification {
    return ProductClassification.instance || new ProductClassification();
  }

  public getItems(): Promise<Array<ProductClassification>> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/${this.endpoint}`;
      url += `?filter[stand]=${this.relationships.stand.data.id}`;
      url += '&page[size]=1000';
      API.Get({
        url,
        jwt: this.jwt.access,
      })
        .then((response: { data: Array<any> }) => {
          const data = RebuildData(response);
          const newOptions = data.data.map((i: any) => {
            const newItem = new ProductClassification();
            newItem.setDataFromPlainObject(i);
            // newItem.URLBase = this.URLBase;
            // newItem.access = this.access;
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
        .then((items: Array<ProductClassification>) => {
          const newOptions = items.map((i: ProductClassification) => {
            const newItem: DropDownFieldOption = {
              id: i.id,
              name: i.attributes.name,
              img_picture: i.attributes.img_picture,
            };
            return newItem;
          });
          res(newOptions);
        })
        .catch((e: any) => rej(e));
    });
  }
}

class ProductClassificationRelationships {
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

export const productClassification = signal<ProductClassification>(
  ProductClassification.getInstance()
).value;
