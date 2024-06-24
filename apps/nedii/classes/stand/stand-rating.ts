import { Signal, signal } from '@preact-signals/safe-react';
import { BaseAPIClass, CommonFields, API } from '@repo/utils';
import User from 'classes/user';

export default class StandRating extends BaseAPIClass {
  public static instance: StandRating;
  public type = 'StandRating';
  public endpoint = 'v1/stand-ratings/';
  public attributes: StandRatingAttributes = new StandRatingAttributes();
  public relationships: StandRatingRelationships =
    new StandRatingRelationships();

  public static getInstance(): StandRating {
    return StandRating.instance || new StandRating();
  }
}

class StandRatingAttributes extends CommonFields {
  private _rating: Signal<number> = signal(0);
  private _description: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.rating = object.attributes.rating ?? this.rating;
      this.description = object.attributes.description ?? this.description;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.rating && {
        rating: this.rating,
      }),
      ...(this.description && {
        description: this.description,
      }),
    };
  }

  public get rating() {
    return this._rating.value;
  }
  public set rating(value) {
    this._rating.value = value;
  }

  public get description() {
    return this._description.value;
  }
  public set description(value) {
    this._description.value = value;
  }
}

class StandRatingRelationships {
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
  public _author: Signal<{ data: User }> = signal({
    data: new User(),
  });

  public setRelationshipsFromPlainObject(object: any) {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
      }
      if (object.relationships.author?.data) {
        this.author.data.id = object.relationships.author.data.id;
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.stand.data.id && {
        stand: this.stand,
      }),
      ...(this.author.data.id && {
        author: this.author,
      }),
    };
  }

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }

  public get author() {
    return this._author.value;
  }
  public set author(value) {
    this._author.value = value;
  }
}

export const standRating = signal<StandRating>(StandRating.getInstance()).value;
