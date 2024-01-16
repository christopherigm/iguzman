import { Signal, signal } from '@preact-signals/safe-react';

export default class Resume {
  public static instance: Resume;
  private _id: Signal<string> = signal('');
  private _URLBase: Signal<string> = signal('');

  public static getInstance(): Resume {
    return Resume.instance || new Resume();
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
}

export const item = signal<Resume>(Resume.getInstance()).value;
