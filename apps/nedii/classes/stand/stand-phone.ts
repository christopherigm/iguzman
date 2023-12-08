import { Signal, signal } from '@preact/signals-react';
import { CommonFields } from 'utils';
import Stand from 'classes/stand';

export default class StandPhone {
  public static instance: StandPhone;
  protected type = 'StandPhone';
  private _id: Signal<number> = signal(0);
  public attributes: StandPhoneAttributes = new StandPhoneAttributes();
  public relationships: StandPhoneRelationships = new StandPhoneRelationships();

  public static getInstance(): StandPhone {
    return StandPhone.instance || new StandPhone();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandPhoneAttributes extends CommonFields {
  private _phone: Signal<string> = signal('');

  public get phone() {
    return this._phone.value;
  }
  public set phone(value) {
    this._phone.value = value;
  }
}

class StandPhoneRelationships {
  public _stand: Signal<{ data: Stand }> = signal({
    data: new Stand(),
  });

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }
}
