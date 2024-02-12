import { Signal, signal } from '@preact-signals/safe-react';
import { Mixin } from 'ts-mixer';
import { CommonFields, WeekSchedule, WebLinks } from '@repo/utils';
import StandAttributesInfo from './stand-attributes-info';
import StandAttributesContact from './stand-attributes-contact';

export default class StandAttributes extends Mixin(
  CommonFields,
  WeekSchedule,
  WebLinks,
  StandAttributesInfo,
  StandAttributesContact
) {
  private _name: Signal<string> = signal('');
  private _slug: Signal<string> = signal('');
  private _img_logo: Signal<string> = signal('');
  private _img_cover: Signal<string> = signal('');
  private _average_rating: Signal<number> = signal(0);
  private _products_max_price: Signal<number> = signal(0);
  private _meals_max_price: Signal<number> = signal(0);
  private _services_max_price: Signal<number> = signal(0);
  private _vehicles_max_price: Signal<number> = signal(0);
  private _real_state_max_price: Signal<number> = signal(0);

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }

  public get img_logo() {
    return this._img_logo.value;
  }
  public set img_logo(value) {
    this._img_logo.value = value;
  }

  public get img_cover() {
    return this._img_cover.value;
  }
  public set img_cover(value) {
    this._img_cover.value = value;
  }

  public get average_rating() {
    return this._average_rating.value;
  }
  public set average_rating(value) {
    this._average_rating.value = value;
  }

  public get products_max_price() {
    return this._products_max_price.value;
  }
  public set products_max_price(value) {
    this._products_max_price.value = value;
  }

  public get meals_max_price() {
    return this._meals_max_price.value;
  }
  public set meals_max_price(value) {
    this._meals_max_price.value = value;
  }

  public get services_max_price() {
    return this._services_max_price.value;
  }
  public set services_max_price(value) {
    this._services_max_price.value = value;
  }

  public get vehicles_max_price() {
    return this._vehicles_max_price.value;
  }
  public set vehicles_max_price(value) {
    this._vehicles_max_price.value = value;
  }

  public get real_state_max_price() {
    return this._real_state_max_price.value;
  }
  public set real_state_max_price(value) {
    this._real_state_max_price.value = value;
  }
}
