import { Signal, signal } from '@preact-signals/safe-react';
import { DropDownFieldOption } from '@repo/ui';
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

  public setURLParametersForWholeObject(): void {
    let url = '&include=classification,stand,delivery_type,';
    url += 'features,features.feature,product_pictures,related';

    url += '&fields[ProductClassification]=id,name,img_picture';
    url += '&fields[ProductFeature]=id,name';
    url += '&fields[ProductFeatureOption]=id,name,feature';
    url += '&fields[Stand]=id,name,img_logo';
    this.URLParameters = url;
  }

  public setURLParametersForMinimumObject(): void {
    let url = '&include=classification,stand,delivery_type,';

    url += '&fields[Product]=id,name,img_picture,full_size,';
    url += 'stock,unlimited_stock,price,discount,final_price,shipping_cost,';
    url += 'times_selled';
    url += 'classification,features,stand';

    url += '&fields[ProductClassification]=id,name,img_picture';
    url += '&fields[ProductFeature]=id,name';
    url += '&fields[ProductFeatureOption]=id,name';
    url += '&fields[Stand]=id,name,img_logo';
    this.URLParameters = url;
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

  public updateProductFeatureOptions(items: Array<DropDownFieldOption>): void {
    if (items.length) {
      const newProductFeatureOptionArray: Array<ProductFeatureOption> = [];
      items.map((i: DropDownFieldOption) => {
        const newOption = new ProductFeatureOption();
        newOption.id = i.id;
        newProductFeatureOptionArray.push(newOption);
      });
      this.features.data = [...newProductFeatureOptionArray];
    }
  }

  public getProductFeatureOptionDropDownItems(): Array<DropDownFieldOption> {
    if (this.features.data.length) {
      const newOptions = this.features.data.map((i: ProductFeatureOption) => {
        let name = `[${i.relationships.feature.data.attributes.name}]`;
        name += ': ';
        name += i.attributes.name;
        const newItem: DropDownFieldOption = {
          id: i.id,
          name,
        };
        return newItem;
      });
      return newOptions;
    }
    return [];
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
