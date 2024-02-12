import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields } from '@repo/utils';
import Stand from 'classes/stand';
import User from 'classes/user';

export default class StandRating {
  public static instance: StandRating;
  protected type = 'StandRating';
  private _id: Signal<number> = signal(0);
  public attributes: StandRatingAttributes = new StandRatingAttributes();
  public relationships: StandRatingRelationships =
    new StandRatingRelationships();

  public static getInstance(): StandRating {
    return StandRating.instance || new StandRating();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandRatingAttributes extends CommonFields {
  private _rating: Signal<number> = signal(0);
  private _description: Signal<string> = signal('');

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
  public _stand: Signal<{ data: Stand }> = signal({
    data: new Stand(),
  });
  public _author: Signal<{ data: User }> = signal({
    data: new User(),
  });

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
