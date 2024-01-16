import { signal } from '@preact-signals/safe-react';
import { BaseSystem } from '@repo/utils';

export default class System extends BaseSystem {
  public static instance: System;

  public static getInstance(): System {
    return System.instance || new System();
  }

  constructor() {
    super();
    this.paths = ['/', '/account'];
  }
}

export const system: System = signal<System>(System.getInstance()).value;
