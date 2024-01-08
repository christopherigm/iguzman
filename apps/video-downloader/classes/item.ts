import { Signal, signal } from '@preact-signals/safe-react';
import {
  API,
  GetLocalStorageData,
  SetLocalStorageData,
  isYoutube,
  isInstagram,
  isTiktok,
  isFacebook,
  isTwitter,
} from '@repo/utils';

type Status = 'downloading' | 'none' | 'ready' | 'error' | 'canceled';
export type VideoType =
  | 'audio'
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'twitter';
export type DownloadOptions = {
  justAudio: boolean;
};

export default class Item {
  public static instance: Item;
  private _id: Signal<string> = signal('');
  private _URLBase: Signal<string> = signal('');
  private _message: Signal<string> = signal('');
  private _name: Signal<string> = signal('');
  private _filename: Signal<string> = signal('');
  private _status: Signal<Status> = signal('none');
  private _url: Signal<string> = signal('');
  private _type: Signal<VideoType | null> = signal(null);
  private _blob: Signal<Blob> = signal(new Blob());
  private _error: Signal<string | null> = signal(null);
  private _created: Signal<Date | null> = signal(null);
  private _justAudio: Signal<boolean> = signal(false);
  private timeout: NodeJS.Timeout = setTimeout(() => {}, 100000);

  public static getInstance(): Item {
    return Item.instance || new Item();
  }

  private handleResponse(response: Item) {
    // console.log('handleResponse', response);
    this.id = response.id;
    if (response.filename) {
      this.filename = response.filename;
    }
    if (response.status) {
      this.status = response.status;
    }
    if (response.name) {
      this.name = response.name;
    }
    this.message = response.message;
    this.error = response.error;
    this.created = response.created || null;
    this.updateLocalStorageItem();
  }

  public setType() {
    if (!this.url || this.type || (this.type === 'youtube' && this.justAudio)) {
      return;
    }
    if (this.justAudio) {
      this.type = 'audio';
    } else if (isYoutube(this.url)) {
      this.type = 'youtube';
    } else if (isInstagram(this.url)) {
      this.type = 'instagram';
    } else if (isTiktok(this.url)) {
      this.type = 'tiktok';
    } else if (isFacebook(this.url)) {
      this.type = 'facebook';
    } else if (isTwitter(this.url)) {
      this.type = 'twitter';
    }
    this.updateLocalStorageItem();
  }

  public getVideo(options?: DownloadOptions) {
    if (!this.URLBase || !this.url) {
      return;
    }
    this.setType();
    let force = false;
    if (
      this.status === 'ready' ||
      this.status === 'error' ||
      this.status === 'canceled'
    ) {
      this.status = 'none';
      force = true;
      this.updateLocalStorageItem();
    }
    if (options) {
      this.justAudio = options?.justAudio ?? false;
    }
    const url = `${this.URLBase}/download-video`;
    let data: any = {
      url: this.url,
      justAudio: this.justAudio,
      force,
    };
    if (this.id) {
      data.id = this.id;
    }
    API.Post({
      url,
      data,
      jsonapi: false,
    })
      .then((response: Item) => {
        this.handleResponse(response);
        this.checkStatus();
      })
      .catch((e) => {
        this.error = e ?? '';
        if (this.error) {
          this.status = 'error';
        }
        this.updateLocalStorageItem();
      });
  }

  public cancelRequest() {
    this.status = 'canceled';
    this.updateLocalStorageItem();
  }

  public clearTimeout() {
    clearTimeout(this.timeout);
  }

  public checkStatus() {
    this.clearTimeout();
    if (
      !this.URLBase ||
      !this.url ||
      this.status === 'ready' ||
      this.status === 'canceled'
    ) {
      return;
    }
    if (this.status === 'error') {
      this.status = 'none';
      this.updateLocalStorageItem();
    }
    if (this.id) {
      API.Get({
        url: `${this.URLBase}/get-videos/${this.id}`,
        jsonapi: false,
      })
        .then((response: Item) => this.handleResponse(response))
        .catch((e) => {
          if (this.id) {
            this.error = e ?? '';
            if (this.error) {
              this.status = 'error';
            }
            this.updateLocalStorageItem();
          }
        })
        .finally(
          () => (this.timeout = setTimeout(() => this.checkStatus(), 2000))
        );
    } else if (this.url) {
      API.Post({
        url: `${this.URLBase}/get-video-name`,
        jsonapi: false,
        data: {
          url: this.url,
          justAudio: this.justAudio,
        },
      })
        .then((response: Item) => this.handleResponse(response))
        .catch((e) => {
          this.error = e ?? '';
          if (this.error) {
            this.status = 'error';
          }
          this.updateLocalStorageItem();
        })
        .finally(
          () => (this.timeout = setTimeout(() => this.checkStatus(), 2000))
        );
    }
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
      filename: this.filename,
      status: this.status,
      url: this.url,
      type: this.type,
      error: this.error,
      created: this.created,
      justAudio: this.justAudio,
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

  public get filename() {
    return this._filename.value;
  }
  public set filename(value) {
    this._filename.value = value;
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

  public get created() {
    return this._created.value;
  }
  public set created(value) {
    this._created.value = value;
  }

  public get justAudio() {
    return this._justAudio.value;
  }
  public set justAudio(value) {
    this._justAudio.value = value;
  }

  public get type() {
    return this._type.value;
  }
  public set type(value) {
    this._type.value = value;
  }
}

export const item = signal<Item>(Item.getInstance()).value;
