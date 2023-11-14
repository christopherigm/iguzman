import { Signal, signal } from "@preact/signals-react";

export type Exposure = 'basic' | 'medium' | 'high' | 'full';

export default class NediiPlan {
  protected type: string = 'NediiPlan';
  private _id: Signal<number> = signal(0);
  public attributes: NediiPlanAttributes = new NediiPlanAttributes();

  public get id() {
    return this._id.value;
  }
  public set id(value: number) {
    this._id.value = value;
  }
}

class NediiPlanAttributes {
  private _name: Signal<string> = signal('');
  private _unlimited_items: Signal<boolean> = signal(false);
  private _number_of_items: Signal<number> = signal(0);
  private _advertising_days: Signal<number> = signal(0);
  private _stand_enabled: Signal<boolean> = signal(false);
  private _digital_card: Signal<boolean> = signal(false);
  private _billed_monthly: Signal<boolean> = signal(false);
  private _exposure: Signal<Exposure> = signal('basic');
  private _price: Signal<number> = signal(0);

  public get name() {
    return this._name.value;
  }
  public set name(value: string) {
    this._name.value = value;
  }
  
  public get unlimited_items() {
    return this._unlimited_items.value;
  }
  public set unlimited_items(value: boolean) {
    this._unlimited_items.value = value;
  }
  
  public get number_of_items() {
    return this._number_of_items.value;
  }
  public set number_of_items(value: number) {
    this._number_of_items.value = value;
  }
  
  public get advertising_days() {
    return this._advertising_days.value;
  }
  public set advertising_days(value: number) {
    this._advertising_days.value = value;
  }
  
  public get stand_enabled() {
    return this._stand_enabled.value;
  }
  public set stand_enabled(value: boolean) {
    this._stand_enabled.value = value;
  }
  
  public get digital_card() {
    return this._digital_card.value;
  }
  public set digital_card(value: boolean) {
    this._digital_card.value = value;
  }
  
  public get billed_monthly() {
    return this._billed_monthly.value;
  }
  public set billed_monthly(value: boolean) {
    this._billed_monthly.value = value;
  }

  public get exposure() {
    return this._exposure.value;
  }
  public set exposure(value: Exposure) {
    this._exposure.value = value;
  }
  
  public get price() {
    return this._price.value;
  }
  public set price(value: number) {
    this._price.value = value;
  }
}
