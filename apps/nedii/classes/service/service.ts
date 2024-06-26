import { Signal, signal } from '@preact-signals/safe-react';
import { API } from '@repo/utils';
import BaseBuyableItem, {
  BaseBuyableItemAttributes,
  BaseBuyableItemRelationships,
} from 'classes/base-buyable-item';
// import ProductClassification from 'classes/product/product-classification';
// import ProductDeliveryType from 'classes/product/product-delivery-type';
// import ProductFeature from 'classes/product/product-feature';
// import ProductPicture from 'classes/product/product-picture';

// enum ProductState {
//   NEW = 'new',
//   LIKE_NEW = 'like-new',
//   USED = 'used',
// }

export default class Service extends BaseBuyableItem {
  public static instance: Service;
  public type = 'Service';
  public relationships: ServiceRelationships = new ServiceRelationships();
  public attributes: ServiceAttributes = new ServiceAttributes();

  public static getInstance(): Service {
    return Service.instance || new Service();
  }
}

class ServiceAttributes extends BaseBuyableItemAttributes {
  // private _state: Signal<ProductState> = signal(ProductState.NEW);
  // private _brand: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      // this.state = object.attributes.state ?? this.state;
      // this.brand = object.attributes.brand ?? this.brand;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      // ...(this.brand && {
      //   brand: this.brand,
      // }),
    };
  }

  // public get brand() {
  //   return this._brand.value;
  // }
  // public set brand(value) {
  //   this._brand.value = value;
  // }
}

class ServiceRelationships extends BaseBuyableItemRelationships {
  // public _classification: Signal<{ data: ProductClassification }> = signal({
  //   data: ProductClassification.getInstance(),
  // });

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      super.setRelationshipsFromPlainObject(object);
      // if (object.relationships.classification?.data) {
      //   this.classification.data.setDataFromPlainObject(
      //     object.relationships.classification.data
      //   );
      // }
      // if (object.relationships.product_pictures?.data) {
      //   const newProductPicturesArray: Array<ProductPicture> = [];
      //   object.relationships.product_pictures.data.map((i: any) => {
      //     const newOption = new ProductPicture();
      //     newOption.setDataFromPlainObject(i);
      //     newProductPicturesArray.push(newOption);
      //   });
      //   this.product_pictures.data = [...newProductPicturesArray];
      // }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...super.getPlainRelationships(),
      // ...(this.classification.data.id && {
      //   classification: {
      //     data: this.classification.data,
      //   },
      // }),
    };
  }
}

export const service = signal<Service>(Service.getInstance()).value;
