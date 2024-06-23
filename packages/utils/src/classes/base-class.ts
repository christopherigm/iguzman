import { Signal, signal } from '@preact-signals/safe-react';
import { API } from '@repo/utils';

export default class BaseAPIClass {
  public type = 'BaseAPIClass';
  public endpoint = 'v1/endpoint/';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _access: Signal<string> = signal('');

  public delete(): Promise<void> {
    return new Promise((res, rej) => {
      if (!this.id) {
        return rej('No ID');
      }
      const url = `${this.URLBase}/${this.endpoint}${this.id}/`;
      const data = {
        url,
        jwt: this.access,
      };
      API.Delete(data)
        .then(() => res())
        .catch((e) => rej(e));
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
