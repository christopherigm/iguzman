import { Signal, signal } from "@preact/signals-react";

export default class StandAttributesInfo {
  private _restaurant: Signal<Boolean> = signal(false);
  private _bar_code: Signal<string> = signal('');
  private _description: Signal<string> = signal('');
  private _short_description: Signal<string> = signal('');
  private _booking_active: Signal<Boolean> = signal(false);
  private _booking_fee: Signal<number> = signal(0);
  private _booking_email: Signal<string> = signal('');
  private _about: Signal<string> = signal('');
  private _mission: Signal<string> = signal('');
  private _vision: Signal<string> = signal('');

  public get restaurant() {
    return this._restaurant.value;
  }
  public set restaurant(value: Boolean) {
    this._restaurant.value = value;
  }
  
  public get bar_code() {
    return this._bar_code.value;
  }
  public set bar_code(value: string) {
    this._bar_code.value = value;
  }
  
  public get description() {
    return this._description.value;
  }
  public set description(value: string) {
    this._description.value = value;
  }
  
  public get short_description() {
    return this._short_description.value;
  }
  public set short_description(value: string) {
    this._short_description.value = value;
  }
  
  public get booking_active() {
    return this._booking_active.value;
  }
  public set booking_active(value: Boolean) {
    this._booking_active.value = value;
  }
  
  public get booking_fee() {
    return this._booking_fee.value;
  }
  public set booking_fee(value: number) {
    this._booking_fee.value = value;
  }
  
  public get about() {
    return this._about.value;
  }
  public set about(value: string) {
    this._about.value = value;
  }
  
  public get booking_email() {
    return this._booking_email.value;
  }
  public set booking_email(value: string) {
    this._booking_email.value = value;
  }
  
  public get mission() {
    return this._mission.value;
  }
  public set mission(value: string) {
    this._mission.value = value;
  }
  
  public get vision() {
    return this._vision.value;
  }
  public set vision(value: string) {
    this._vision.value = value;
  }
}
