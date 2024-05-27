import { Signal, signal } from '@preact-signals/safe-react';
import { BasePicture } from '@repo/utils';

export default class StandPicture extends BasePicture {
  public static instance: StandPicture;
  public type = 'StandPicture';
  public relationships: StandPictureRelationships =
    new StandPictureRelationships();

  public static getInstance(): StandPicture {
    return StandPicture.instance || new StandPicture();
  }

  public getPlainRelationships(): Object {
    return {
      ...(this.relationships.stand.data.id && {
        stand: {
          data: this.relationships.stand.data,
        },
      }),
    };
  }

  public getPlainObject(): Object {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.getPlainAttributes(),
      relationships: this.getPlainRelationships(),
    };
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
    // Relationships
    if (object.relationships?.stand?.data) {
      this.relationships.stand.data.id = object.relationships.stand.data.id;
    }
  }
}

class StandPictureRelationships {
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

export const standPicture = signal<StandPicture>(
  StandPicture.getInstance()
).value;
