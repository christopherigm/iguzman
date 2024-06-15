import { Signal, signal } from '@preact-signals/safe-react';
import {
  API,
  BaseSystem,
  GetLocalStorageData,
  SetLocalStorageData,
} from '@repo/utils';
import User from 'classes/user';

export default class System extends BaseSystem {
  public static instance: System;
  private _users: Signal<Array<User>> = signal([]);

  public static getInstance(): System {
    return System.instance || new System();
  }

  constructor() {
    super();
    this.paths = ['/', '/account'];
  }

  public getUsers(): Promise<Array<User>> {
    return new Promise((res, rej) => {
      if (!this.URLBase) {
        return rej('No URLBase');
      }
      const url = `${this.URLBase}/v1/users/`;
      API.Get({
        url,
        jsonapi: false,
      })
        .then((response: any) => {
          this.users = [];
          response.data.forEach((i: any) => {
            const newItem = User.getInstance();
            newItem.id = Number(i.id);
            newItem.setResumeUserAttributesFromPlainObject(i);
            this.users.push(newItem);
          });
          this.users = [...this.users];
          this.saveItemsToLocalStorage();
          res(response.data);
        })
        .catch((e) => rej(e));
    });
  }

  public getResumePlainAttributes(): any {
    return {
      ...this.getPlainAttributes(),
      users: this.users,
    };
  }

  public setResumeSystemAttributesFromPlainObject(props: any): void {
    this.setSystemAttributesFromPlainObject(props);
    this.users = props.users ?? this.users;
  }

  public saveItemsToLocalStorage() {
    const itemsToSave = this.users
      ? this.users.map((i: User) => {
          return {
            id: i.id,
            attributes: i.getResumePlainAttributes(),
          };
        })
      : [];
    SetLocalStorageData('users', JSON.stringify(itemsToSave));
  }

  public getItemsFromLocalStorage() {
    let cachedItems: any = GetLocalStorageData('users');
    if (cachedItems) {
      cachedItems = JSON.parse(cachedItems) as Array<any>;
      this.users = cachedItems.map((i: any) => {
        const newItem = User.getInstance();
        newItem.id = Number(i.id);
        newItem.setResumeUserAttributesFromPlainObject(i);
        return newItem;
      });
    }
  }

  public get users() {
    return this._users.value;
  }
  public set users(value) {
    this._users.value = value;
  }
}

export const system: System = signal<System>(System.getInstance()).value;
