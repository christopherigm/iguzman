import { Signal, signal } from '@preact-signals/safe-react';
import { BasePicture } from '@repo/utils';

export default abstract class BaseItemPicture extends BasePicture {
  public relationships: BaseItemPictureRelationships =
    new BaseItemPictureRelationships();
}

class BaseItemPictureRelationships {
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
  public _product: Signal<{
    data: {
      id: number;
      type: 'Product';
    };
  }> = signal({
    data: {
      id: 0,
      type: 'Product',
    },
  });
  public _service: Signal<{
    data: {
      id: number;
      type: 'Service';
    };
  }> = signal({
    data: {
      id: 0,
      type: 'Service',
    },
  });

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
      }
      if (object.relationships.product?.data) {
        this.product.data.id = object.relationships.product.data.id;
      }
      if (object.relationships.service?.data) {
        this.service.data.id = object.relationships.service.data.id;
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
      ...(this.product.data.id && {
        product: {
          data: this.product.data,
        },
      }),
      ...(this.service.data.id && {
        service: {
          data: this.service.data,
        },
      }),
    };
  }

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }

  public get product() {
    return this._product.value;
  }
  public set product(value) {
    this._product.value = value;
  }

  public get service() {
    return this._service.value;
  }
  public set service(value) {
    this._service.value = value;
  }
}
