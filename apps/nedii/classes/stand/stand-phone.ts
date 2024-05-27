import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, API } from '@repo/utils';

export default class StandPhone {
  public static instance: StandPhone;
  protected type = 'StandPhone';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _access: Signal<string> = signal('');
  public attributes: StandPhoneAttributes = new StandPhoneAttributes();
  public relationships: StandPhoneRelationships = new StandPhoneRelationships();

  public static getInstance(): StandPhone {
    return StandPhone.instance || new StandPhone();
  }

  public getPlainAttributes(): Object {
    return {
      ...(this.attributes.phone && { phone: this.attributes.phone }),
    };
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

  public getPhoneByStandID(): Promise<void> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/v1/stand-phones/`;
      url += `?filter[stand]=${this.relationships.stand.data.id}`;
      url += `&filter[phone]=${this.attributes.phone}`;
      const data = {
        url,
        jwt: this.access,
      };
      API.Get(data)
        .then((response) => {
          if (response.errors && response.errors.length) {
            return rej(response.errors);
          } else if (!response.data || !response.data.length) {
            return rej(new Error('No Data'));
          }
          this.id = response.data[0].id ?? this.id;
          return res();
        })
        .catch((error) => rej(error));
    });
  }

  public save(): Promise<void> {
    return new Promise((res, rej) => {
      const url = `${this.URLBase}/v1/stand-phones/`;
      const data = {
        url,
        jwt: this.access,
        data: this.getPlainObject(),
      };
      API.Post(data)
        .then((response) => {
          if (response.errors && response.errors.length) {
            if (response.errors[0].code === 'unique') {
              return this.getPhoneByStandID().then(() => res());
            }
            return rej(response.errors);
          }
          this.id = response.data?.id ?? this.id;
          return res();
        })
        .catch((error) => rej(error));
    });
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

class StandPhoneAttributes extends CommonFields {
  private _phone: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      this.phone = object.attributes.phone ?? this.phone;
    }
  }

  public get phone() {
    return this._phone.value;
  }
  public set phone(value) {
    this._phone.value = value;
  }
}

class StandPhoneRelationships {
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

export const standPhone = signal<StandPhone>(StandPhone.getInstance()).value;
