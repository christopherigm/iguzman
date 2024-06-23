import { Signal, signal } from '@preact-signals/safe-react';
import { API, removeImagesForAPICall, RebuildData } from '@repo/utils';
import BaseBuyableItem, {
  BaseBuyableItemAttributes,
  BaseBuyableItemRelationships,
} from 'classes/base-buyable-item';
import ProductClassification from 'classes/product/product-classification';
import ProductDeliveryType from 'classes/product/product-delivery-type';
import ProductFeatureOption from 'classes/product/product-feature-option';
import ProductPicture from 'classes/product/product-picture';

enum ProductState {
  NEW = 'new',
  LIKE_NEW = 'like-new',
  USED = 'used',
}

export default class Product extends BaseBuyableItem {
  public static instance: Product;
  public endpoint = 'v1/products/';
  public type = 'Product';
  public relationships: ProductRelationships = new ProductRelationships();
  public attributes: ProductAttributes = new ProductAttributes();

  public static getInstance(): Product {
    return Product.instance || new Product();
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
      const url = `${this.URLBase}/${this.endpoint}${
        this.id ? this.id + '/' : ''
      }`;
      const data = {
        url,
        jwt: this.access,
        data: this.getPlainObject(),
      };
      removeImagesForAPICall(data.data.attributes);
      if (this.id) {
        API.Patch(data)
          .then((response) => {
            if (response.errors && response.errors.length) {
              return rej(response.errors);
            }
            return res();
          })
          .catch((error) => rej(error));
      } else {
        API.Post(data)
          .then((response) => {
            if (response.errors && response.errors.length) {
              return rej(response.errors);
            }
            this.id = Number(response.data?.id ?? this.id);
            return res();
          })
          .catch((error) => rej(error));
      }
    });
  }
}

class ProductAttributes extends BaseBuyableItemAttributes {
  private _state: Signal<ProductState> = signal(ProductState.NEW);
  private _brand: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.state = object.attributes.state ?? this.state;
      this.brand = object.attributes.brand ?? this.brand;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.state && {
        state: this.state,
      }),
      ...(this.brand && {
        brand: this.brand,
      }),
    };
  }

  public get state() {
    return this._state.value;
  }
  public set state(value) {
    this._state.value = value;
  }

  public get brand() {
    return this._brand.value;
  }
  public set brand(value) {
    this._brand.value = value;
  }
}
class ProductRelationships extends BaseBuyableItemRelationships {
  public _classification: Signal<{ data: ProductClassification }> = signal({
    data: ProductClassification.getInstance(),
  });
  public _delivery_type: Signal<{ data: ProductDeliveryType }> = signal({
    data: ProductDeliveryType.getInstance(),
  });
  public _features: Signal<{ data: Array<ProductFeatureOption> }> = signal({
    data: [],
  });
  public _product_pictures: Signal<{ data: Array<ProductPicture> }> = signal({
    data: [],
  });
  public _related: Signal<{ data: Array<Product> }> = signal({
    data: [],
  });

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      // if (object.relationships.stand?.data) {
      //   this.stand.data.id = object.relationships.stand.data.id;
      //   this.stand.data.attributes.setAttributesFromPlainObject(
      //     object.relationships.stand.data
      //   );
      // }
      super.setRelationshipsFromPlainObject(object);
      if (object.relationships.classification?.data) {
        this.classification.data.setDataFromPlainObject(
          object.relationships.classification.data
        );
      }
      if (object.relationships.features?.data) {
        const newProductFeatureOptionArray: Array<ProductFeatureOption> = [];
        object.relationships.features.data.map((i: any) => {
          const newOption = new ProductFeatureOption();
          newOption.setDataFromPlainObject(i);
          newProductFeatureOptionArray.push(newOption);
        });
        this.features.data = [...newProductFeatureOptionArray];
      }
      if (object.relationships.product_pictures?.data) {
        const newProductPicturesArray: Array<ProductPicture> = [];
        object.relationships.product_pictures.data.map((i: any) => {
          const newOption = new ProductPicture();
          newOption.setDataFromPlainObject(i);
          newProductPicturesArray.push(newOption);
        });
        this.product_pictures.data = [...newProductPicturesArray];
      }
      if (object.relationships.related?.data) {
        const newRelatedProductsArray: Array<Product> = [];
        object.relationships.related.data.map((i: any) => {
          const newOption = new Product();
          newOption.setDataFromPlainObject(i);
          newRelatedProductsArray.push(newOption);
        });
        this.related.data = [...newRelatedProductsArray];
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...super.getPlainRelationships(),
      ...(this.classification.data.id && {
        classification: {
          data: this.classification.data.getPlainObject(),
        },
      }),
      features: {
        data: this.features.data.map((i) => i.getPlainObject()),
      },
      product_pictures: {
        data: this.product_pictures.data.map((i) => i.getPlainObject()),
      },
      related: {
        data: this.related.data.map((i) => i.getPlainObject()),
      },
      delivery_type: {
        data: [],
      },
    };
  }

  public get classification() {
    return this._classification.value;
  }
  public set classification(value) {
    this._classification.value = value;
  }

  public get features() {
    return this._features.value;
  }
  public set features(value) {
    this._features.value = value;
  }

  public get product_pictures() {
    return this._product_pictures.value;
  }
  public set product_pictures(value) {
    this._product_pictures.value = value;
  }

  public get related() {
    return this._related.value;
  }
  public set related(value) {
    this._related.value = value;
  }
}

export const product = signal<Product>(Product.getInstance()).value;
