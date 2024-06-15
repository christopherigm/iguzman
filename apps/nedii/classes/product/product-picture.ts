import { signal } from '@preact-signals/safe-react';
import BaseItemPicture from 'classes/base-item-picture';

export default class ProductPicture extends BaseItemPicture {
  public static instance: ProductPicture;
  public type = 'ProductPicture';
  public endpoint = 'v1/product-pictures/';

  public static getInstance(): ProductPicture {
    return ProductPicture.instance || new ProductPicture();
  }
}

export const productPicture = signal<ProductPicture>(
  ProductPicture.getInstance()
).value;
