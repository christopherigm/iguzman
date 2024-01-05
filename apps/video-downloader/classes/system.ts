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

  public getServerSideProps(): Object {
    return {
      hostName: this.hostName,
      URLBase: this.URLBase,
      K8sURLBase: this.K8sURLBase,
      defaultLanguage: this.defaultLanguage,
      loginEnabled: this.loginEnabled,
      cartEnabled: this.cartEnabled,
      favoritesEnabled: this.favoritesEnabled,
      ordersEnabled: this.ordersEnabled,
      version: this.version,
      isLoading: this.isLoading,
      language: this.language,
      darkMode: this.darkMode,
      devMode: this.devMode,
    };
  }

  public setServerSideProps(props: any): void {
    this.hostName = props.hostName ?? this.hostName;
    this.URLBase = props.URLBase ?? this.URLBase;
    this.K8sURLBase = props.K8sURLBase ?? this.K8sURLBase;
    this.defaultLanguage = props.defaultLanguage ?? this.defaultLanguage;
    this.loginEnabled = props.loginEnabled ?? this.loginEnabled;
    this.cartEnabled = props.cartEnabled ?? this.cartEnabled;
    this.favoritesEnabled = props.favoritesEnabled ?? this.favoritesEnabled;
    this.ordersEnabled = props.ordersEnabled ?? this.ordersEnabled;
    this.version = props.version ?? this.version;
    this.isLoading = props.isLoading ?? this.isLoading;
    this.language = props.language ?? this.language;
    this.darkMode = props.darkMode ?? this.darkMode;
    this.devMode = props.devMode ?? this.devMode;
  }

  public addItem(url: string, options: DownloadOptions) {
    const item = Item.getInstance();
    item.URLBase = this.URLBase;
    item.url = url;
    item.getVideo(options);
    this.items = [item, ...this.items];
    this.saveItemsToLocalStorage();
  }

  public deleteItem(id: string) {
    if (this.items.length === 1) {
      this.items = [];
    } else {
      const index = this.items.findIndex((i: Item) => i.id === id);
      if (index > -1) {
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
        newItem.setType();
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
