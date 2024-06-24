import { Signal, signal } from '@preact-signals/safe-react';
import { BasePicture, BasePictureAttributes } from '@repo/utils';

export default class ProductDeliveryType extends BasePicture {
  public static instance: ProductDeliveryType;
  public type = 'ProductDeliveryType';
  public endpoint = 'v1/product-delivery-types/';
  public attributes: ProductDeliveryTypeAttributes =
    new ProductDeliveryTypeAttributes();
  public relationships = null;

  public static getInstance(): ProductDeliveryType {
    return ProductDeliveryType.instance || new ProductDeliveryType();
  }
}

class ProductDeliveryTypeAttributes extends BasePictureAttributes {
  private _icon: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.icon = object.attributes.icon ?? this.icon;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.icon && {
        icon: this.icon,
      }),
    };
  }

  public get icon() {
    return this._icon.value;
  }
  public set icon(value) {
    this._icon.value = value;
  }
}

export const productDeliveryType = signal<ProductDeliveryType>(
  ProductDeliveryType.getInstance()
).value;
