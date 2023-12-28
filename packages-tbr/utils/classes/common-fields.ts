import { Signal, signal,  } from "@preact/signals-react";
import TimeFields from './time-fields';

export default class CommonFields extends TimeFields {
  private _enabled: Signal<boolean> = signal(false);
  private _order: Signal<number> = signal(0);
  private _version: Signal<number> = signal(0);

  public get enabled() {
    return this._enabled.value;
  }
  public set enabled(value) {
    this._enabled.value = value;
  }

  public get order() {
    return this._order.value;
  }
  public set order(value) {
    this._order.value = value;
  }

  public get version() {
    return this._version.value;
  }
  public set version(value) {
    this._version.value = value;
  }
}
