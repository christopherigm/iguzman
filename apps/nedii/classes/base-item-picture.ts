import { Signal, signal } from '@preact-signals/safe-react';
import { BasePicture, API } from '@repo/utils';

export default abstract class BaseItemPicture extends BasePicture {
  public relationships: BaseItemPictureRelationships =
    new BaseItemPictureRelationships();

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
