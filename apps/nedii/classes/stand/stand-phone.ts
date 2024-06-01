import { Signal, signal } from '@preact-signals/safe-react';
import { BaseAPIClass, CommonFields, API } from '@repo/utils';

export default class StandPhone extends BaseAPIClass {
  public static instance: StandPhone;
  public type = 'StandPhone';
  public endpoint = 'v1/stand-phones/';
  public attributes: StandPhoneAttributes = new StandPhoneAttributes();
  public relationships: StandPhoneRelationships = new StandPhoneRelationships();

  public static getInstance(): StandPhone {
    return StandPhone.instance || new StandPhone();
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
    this.relationships.setRelationshipsFromPlainObject(object);
  }

  public getPlainObject(): Object {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
      relationships: this.relationships.getPlainRelationships(),
    };
  }

  public getPhoneByStandID(): Promise<void> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/${this.endpoint}`;
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
      const url = `${this.URLBase}/${this.endpoint}`;
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
}

class StandPhoneAttributes extends CommonFields {
  private _phone: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.phone = object.attributes.phone ?? this.phone;
    }
  }

  public getPlainAttributes(): Object {
    return {
      ...super.getPlainAttributes(),
      ...(this.phone && { phone: this.phone }),
    };
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

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
      }
    }
  }

  public getPlainRelationships(): Object {
    return {
      ...(this.stand.data.id && {
        stand: {
          data: this.stand.data,
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
}

export const standPhone = signal<StandPhone>(StandPhone.getInstance()).value;
