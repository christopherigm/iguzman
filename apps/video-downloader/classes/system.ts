import { Signal, signal } from '@preact-signals/safe-react';
import {
  BaseSystem,
  GetLocalStorageData,
  SetLocalStorageData,
} from '@repo/utils';
import Item from 'classes/item';
import type { DownloadOptions } from 'classes/item';

export default class System extends BaseSystem {
  public static instance: System;
  private _items: Signal<Array<Item>> = signal([]);

  public static getInstance(): System {
    return System.instance || new System();
  }

  constructor() {
    super();
    this.paths = ['/', '/account'];
  }

  public addItem(url: string, options: DownloadOptions) {
    const item = Item.getInstance();
    item.URLBase = this.URLBase;
    item.url = url;
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

  public get items() {
    return this._items.value;
  }
  public set items(value) {
    this._items.value = value;
  }
}

export const system: System = signal<System>(System.getInstance()).value;
