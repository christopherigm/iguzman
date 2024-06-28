import { Signal, signal } from '@preact-signals/safe-react';
import {
  API,
  GetLocalStorageData,
  JWTPayload,
  RebuildData,
  SetLocalStorageData,
  removeImagesForAPICall,
} from '@repo/utils';

export default abstract class BaseAPIClass {
  abstract type: string;
  abstract endpoint: string;
  abstract attributes: any;
  abstract relationships: any;
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _URLParameters: Signal<string> = signal('');
  private _jwt: Signal<JWTPayload> = signal({
    exp: 0,
    iat: 0,
    jti: '',
    token_type: '',
    user_id: 0,
    access: '',
    refresh: '',
  });

  constructor() {
    const jwt: JWTPayload = JSON.parse(GetLocalStorageData('jwt') || '{}');
    this.jwt = jwt.access ? jwt : this.jwt;
    const system: any = JSON.parse(GetLocalStorageData('System') || '{}');
    this.URLBase = system.URLBase || this.URLBase;
  }

  public setURLParametersForWholeObject(): void {
    this.URLParameters = '';
  }

  public setURLParametersForMinimumObject(): void {
    this.URLParameters = '';
  }

  public getItemsFromAPI(): Promise<Array<any>> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/${this.endpoint}`;
      if (this.URLParameters) {
        url += `?${this.URLParameters}`;
      }
      API.Get({
        url,
        jwt: this.jwt.access,
      })
        .then((response: any) => {
          const data =
            url.search('include') > -1 ? RebuildData(response) : response;
          res(data.data);
        })
        .catch((error) => rej(error));
    });
  }

  public setItemByIDFromAPI(): Promise<void> {
    return new Promise((res, rej) => {
      if (!this.id) {
        return rej('no-id');
      }
      let url = `${this.URLBase}/${this.endpoint}${this.id}/`;
      if (this.URLParameters) {
        url += `?${this.URLParameters}`;
      }
      API.Get({
        url,
        jwt: this.jwt.access,
      })
        .then((response: any) => {
          const data =
            url.search('include') > -1 ? RebuildData(response) : response;
          this.setDataFromPlainObject(data.data);
          this.URLParameters = '';
          res();
        })
        .catch((e: any) => rej(e));
    });
  }

  public getPlainAttributes(): any {
    return (this.attributes && this.attributes.getPlainAttributes()) || {};
  }

  public getPlainRelationships(): any {
    return (
      (this.relationships && this.relationships.getPlainRelationships()) || {}
    );
  }

  public setDataFromPlainObject(object: any) {
    const id = object.id || 0;
    this.id = Number(id) ?? this.id;
    this.attributes && this.attributes.setAttributesFromPlainObject(object);
    this.relationships &&
      this.relationships.setRelationshipsFromPlainObject(object);
  }

  public getMinimumPlainObject(): any {
    return {
      ...(this.id && { id: Number(this.id) }),
      type: this.type,
    };
  }

  public getPlainObject(): any {
    const attributes = this.getPlainAttributes();
    const relationships = this.getPlainRelationships();
    return {
      ...(this.id && { id: Number(this.id) }),
      type: this.type,
      ...(attributes && {
        attributes,
      }),
      ...(relationships && {
        relationships,
      }),
    };
  }

  public saveLocalStorage() {
    const data = this.getPlainObject();
    if (data.attributes.password) {
      delete data.attributes.password;
    }
    SetLocalStorageData(this.type, JSON.stringify(data));
  }

  public deleteLocalStorage() {
    SetLocalStorageData(this.type, '');
  }

  public setDataFromLocalStorage() {
    let cached: any = GetLocalStorageData(this.type);
    if (cached) {
      cached = JSON.parse(cached);
      this.setDataFromPlainObject(cached);
    }
  }

  public setItemFromAPI(): Promise<any> {
    return new Promise((res, rej) => {
      let url = `${this.URLBase}/${this.endpoint}${this.id}`;
      API.Get({
        url,
        jwt: this.jwt.access,
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
        jwt: this.jwt.access,
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
        jwt: this.jwt.access,
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

  public get URLParameters() {
    return this._URLParameters.value;
  }
  public set URLParameters(value) {
    this._URLParameters.value = value;
  }

  public get jwt() {
    return this._jwt.value;
  }
  public set jwt(value) {
    this._jwt.value = value;
  }
}
