import { Signal, signal } from '@preact-signals/safe-react';
import {
  BaseSystem,
  GetLocalStorageData,
  SetLocalStorageData,
  isX,
} from '@repo/utils';
import Item from 'classes/item';
import type { DownloadOptions } from 'classes/item';

export default class System extends BaseSystem {
  public static instance: System;
  private _items: Signal<Array<Item>> = signal([]);
  private _userAgent: Signal<string> = signal('');
  private _iOS: Signal<boolean> = signal(false);
  private _supported: Signal<boolean> = signal(true);

  public static getInstance(): System {
    return System.instance || new System();
  }

  constructor() {
    super();
    this.paths = ['/', '/account'];
  }

  public getVDPlainAttributes(): any {
    return {
      ...this.getPlainObject(),
      userAgent: this.userAgent,
      iOS: this.iOS,
    };
  }

  public setDataFromPlainObject(object: any): void {
    super.setDataFromPlainObject(object);
    this.userAgent = object.userAgent ?? this.userAgent;
    this.iOS = object.iOS ?? this.iOS;
    this.supported = !(system.userAgent.includes('CriOS') && system.iOS);
  }

  public addItem(url: string, options: DownloadOptions) {
    const item = Item.getInstance();
    item.URLBase = this.URLBase;
    item.url = url;
    if (isX(url)) {
      item.url = url.replaceAll('x.com', 'twitter.com');
    }
    item.getVideo(options);
    this.items.unshift(item);
    this.items = [...this.items];
    this.saveItemsToLocalStorage();
  }

  public deleteItem(id: string) {
    if (this.items.length === 1) {
      this.items = [];
    } else {
      const index = this.items.findIndex((i: Item) => i.id === id);
      if (index > -1) {
        this.items[index]?.cancelRequest();
        this.items[index]?.clearTimeout();
        this.items.splice(index, 1);
        this.items = [...this.items];
      }
    }
    this.saveItemsToLocalStorage();
  }

  public saveItemsToLocalStorage() {
    const itemsToSave = this.items.map((i: Item) => {
      return i.getItemToSaveInLocalStorage();
    });
    SetLocalStorageData('items', JSON.stringify(itemsToSave));
  }

  public getItemsFromLocalStorage() {
    let cachedItems: any = GetLocalStorageData('items');
    if (cachedItems) {
      cachedItems = JSON.parse(cachedItems) as Array<any>;
      this.items = cachedItems.map((i: any) => {
        const newItem = Item.getInstance();
        newItem.id = i.id;
        newItem.URLBase = this.URLBase;
        newItem.name = i.name;
        newItem.filename = i.filename;
        newItem.status = i.status;
        newItem.url = i.url;
        newItem.error = i.error;
        newItem.created = i.created;
        newItem.justAudio = i.justAudio;
        if (!i.type) {
          newItem.setType();
        } else {
          newItem.type = i.type;
        }
        newItem.checkStatus();
        return newItem;
      });
    }
  }

  public checkForiOS(): void {
    const iOS =
      this.userAgent.indexOf('iPad') > -1 ||
      this.userAgent.indexOf('iPhone') > -1;
    this.iOS = iOS;
  }

  public get items() {
    return this._items.value;
  }
  public set items(value) {
    this._items.value = value;
  }

  public get userAgent() {
    return this._userAgent.value;
  }
  public set userAgent(value) {
    this._userAgent.value = value;
  }

  public get iOS() {
    return this._iOS.value;
  }
  public set iOS(value) {
    this._iOS.value = value;
  }

  public get supported() {
    return this._supported.value;
  }
  public set supported(value) {
    this._supported.value = value;
  }
}

export const system: System = signal<System>(System.getInstance()).value;
