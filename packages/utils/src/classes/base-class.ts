import { Signal, signal } from '@preact-signals/safe-react';
import { API, removeImagesForAPICall } from '@repo/utils';

export default abstract class BaseAPIClass {
  abstract type: string;
  abstract endpoint: string;
  abstract attributes: any;
  abstract relationships: any;
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _access: Signal<string> = signal('');

  setAttributesFromPlainObject(object: any) {
    this.attributes && this.attributes.setAttributesFromPlainObject(object);
  }

  setRelationshipsFromPlainObject(object: any) {
    this.relationships &&
      this.relationships.setRelationshipsFromPlainObject(object);
  }

  getPlainAttributes(): any {
    return (this.attributes && this.attributes.getPlainAttributes()) || {};
  }

  getPlainRelationships(): any {
    return (
      (this.relationships && this.relationships.getPlainRelationships()) || {}
    );
  }

  setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.setAttributesFromPlainObject(object);
    this.setRelationshipsFromPlainObject(object);
  }

  public getMinimumPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
    };
  }

  public getPlainObject(): any {
    const attributes = this.getPlainAttributes();
    const relationships = this.getPlainRelationships();
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      ...(attributes && {
        attributes,
      }),
      ...(relationships && {
        relationships,
      }),
    };
  }

  public setItemFromAPI(): Promise<any> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/${this.endpoint}${this.id}`;
      API.Get({
        url,
        jwt: this.access,
      })
        .then((response: any) => this.setDataFromPlainObject(response.data))
        .catch((e: any) => rej(e));
    });
  }

  public save(): Promise<any> {
    return new Promise((res, rej) => {
      const url = `${this.URLBase}/${this.endpoint}${
        this.id ? `${this.id}/` : ''
      }`;
      const data: any = {
        url,
        jwt: this.access,
        data: this.getPlainObject(),
      };
      removeImagesForAPICall(data.data.attributes);
      const method = this.id ? API.Patch : API.Post;
      method(data)
        .then((response) => {
          if (response.errors && response.errors.length) {
            return rej(response.errors);
          }
          this.id = Number(response.data?.id ?? this.id);
          return res(response);
        })
        .catch((error) => rej(error));
    });
  }

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
