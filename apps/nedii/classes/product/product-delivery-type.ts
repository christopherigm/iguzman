import { Signal, signal } from '@preact-signals/safe-react';
import { BasePicture, BasePictureAttributes, API } from '@repo/utils';

export default class ProductDeliveryType extends BasePicture {
  public static instance: ProductDeliveryType;
  public type = 'ProductDeliveryType';
  public endpoint = 'v1/product-delivery-types/';
  public attributes: ProductDeliveryTypeAttributes =
    new ProductDeliveryTypeAttributes();

  public static getInstance(): ProductDeliveryType {
    return ProductDeliveryType.instance || new ProductDeliveryType();
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
  }

  public getPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
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
