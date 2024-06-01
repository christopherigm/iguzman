import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';

export default class Product {
  public static instance: Product;
  protected type = 'Product';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _access: Signal<string> = signal('');
  public attributes: ProductAttributes = new ProductAttributes();
  public relationships: ProductRelationships = new ProductRelationships();

  public static getInstance(): Product {
    return Product.instance || new Product();
  }

  public setAttributesFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.name = object.attributes.alias ?? this.attributes.name;
    // Relationships
    if (object.relationships?.stand?.data) {
      this.relationships.stand.data.id = object.relationships.stand.data.id;
    }
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }

  public get URLBase() {
    return this._URLBase.value;
  }
  public set URLBase(value) {
    this._URLBase.value = value;
  }

  public get access() {
    return this._access.value;
  }
  public set access(value) {
    this._access.value = value;
  }
}

class ProductAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _slug: Signal<string> = signal('');
  private _img_picture: Signal<string> = signal('');
  private _description: Signal<string> = signal('');

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }
}

class ProductRelationships {
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

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }
}

export const product = signal<Product>(Product.getInstance()).value;
