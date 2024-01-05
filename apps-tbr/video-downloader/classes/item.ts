import { Signal, signal } from '@preact/signals-react';
import { API } from 'utils';
import type ItemResponse from 'interfaces/item-response';
import { GetLocalStorageData, SetLocalStorageData } from 'utils';

type Status = 'downloading' | 'none' | 'ready' | 'error';

export default class Item {
  public static instance: Item;
  private _id: Signal<string> = signal('');
  private _URLBase: Signal<string> = signal('');
  private _message: Signal<string> = signal('');
  private _name: Signal<string> = signal('');
  private _status: Signal<Status> = signal('none');
  private _url: Signal<string> = signal('');
  private _blob: Signal<Blob> = signal(new Blob());
  private _error: Signal<string | null> = signal(null);
  private timeout: NodeJS.Timeout = setTimeout(() => {}, 100000);

  public static getInstance(): Item {
    return Item.instance || new Item();
  }

  private handleResponse(response: ItemResponse) {
    this.id = response.id;
    this.status = response.status;
    this.message = response.message;
    if (response.name) {
      this.name = response.name;
    }
    this.error = response.error;
    this.updateLocalStorageItem();
  }

  public getVideo() {
    console.log('> getVideo');
    if (!this.URLBase || !this.url) {
      return;
    }
    const url = `${this.URLBase}/download-video`;
    const data = {
      url: this.url,
    };
    API.Post({
      url,
      data,
      jsonapi: false,
    })
      .then((response: ItemResponse) => {
        this.handleResponse(response);
        this.checkStatus();
      })
      .catch((e) => {
        this.error = e;
        this.status = 'error';
        this.updateLocalStorageItem();
      });
  }

  public checkStatus() {
    console.log('> checkStatus');
    clearTimeout(this.timeout);
    if (
      !this.URLBase ||
      !this.url ||
      !this.id ||
      this.status === 'ready' ||
      this.status === 'error'
    ) {
      return;
    }
    const url = `${this.URLBase}/get-videos/${this.id}`;
    API.Get({
      url,
      jsonapi: false,
    })
      .then((response: ItemResponse) => this.handleResponse(response))
      .catch((e) => {
        this.error = e;
        this.status = 'error';
        this.updateLocalStorageItem();
      })
      .finally(
        () => (this.timeout = setTimeout(() => this.checkStatus(), 3000))
      );
  }

  public updateLocalStorageItem() {
    const items: Array<any> = this.getItemFromLocalStorage();
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === this.id || items[i].url === this.url) {
        items[i] = this.getItemToSaveInLocalStorage();
      }
    }
    SetLocalStorageData('items', JSON.stringify(items));
  }

  public getItemFromLocalStorage(): Array<Item> {
    let cachedItems: any = GetLocalStorageData('items');
    if (cachedItems) {
      cachedItems = (JSON.parse(cachedItems) as Array<any>) ?? [];
      return cachedItems;
    }
    return [];
  }

  public getItemToSaveInLocalStorage() {
    return {
      id: this.id,
      URLBase: this.URLBase,
      name: this.name,
      status: this.status,
      url: this.url,
      error: this.error,
    };
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

  public get message() {
    return this._message.value;
  }
  public set message(value) {
    this._message.value = value;
  }

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get status() {
    return this._status.value;
  }
  public set status(value) {
    this._status.value = value;
  }

  public get url() {
    return this._url.value;
  }
  public set url(value) {
    this._url.value = value;
  }

  public get blob() {
    return this._blob.value;
  }
  public set blob(value) {
    this._blob.value = value;
  }

  public get error() {
    return this._error.value;
  }
  public set error(value) {
    this._error.value = value;
  }
}

export const item = signal<Item>(Item.getInstance()).value;
