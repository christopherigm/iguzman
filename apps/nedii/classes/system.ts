import { signal } from '@preact-signals/safe-react';
import {
  BaseSystem,
  SetLocalStorageData,
  GetLocalStorageData,
} from '@repo/utils';

export default class System extends BaseSystem {
  public static instance: System;

  public static getInstance(): System {
    return System.instance || new System();
  }

  constructor() {
    super();
    this.paths = ['/', '/account', '/companies'];
  }

  public getPlainObject(): any {
    return {
      ...super.getPlainObject(),
    };
  }

  public setDataFromPlainObject(props: any): void {
    super.setDataFromPlainObject(props);
    SetLocalStorageData(this.type, JSON.stringify(this.getPlainObject()));
  }

  public setDataFromLocalStorage(): void {
    super.setDataFromPlainObject(
      JSON.parse(GetLocalStorageData(this.type) || '{}')
    );
  }
}

export const system: System = signal<System>(System.getInstance()).value;
