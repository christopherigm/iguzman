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

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      this.setWebLinksFromPlainObject(object.attributes);
      this.name = object.attributes.name ?? this.name;
      this.slug = object.attributes.slug ?? this.slug;
      this.img_logo = object.attributes.img_logo ?? this.img_logo;
      this.img_cover = object.attributes.img_cover ?? this.img_cover;
      this.average_rating =
        object.attributes.average_rating ?? this.average_rating;
      this.products_max_price =
        object.attributes.products_max_price ?? this.products_max_price;
      this.meals_max_price =
        object.attributes.meals_max_price ?? this.meals_max_price;
      this.services_max_price =
        object.attributes.services_max_price ?? this.services_max_price;
      this.vehicles_max_price =
        object.attributes.vehicles_max_price ?? this.vehicles_max_price;
      this.real_state_max_price =
        object.attributes.real_state_max_price ?? this.real_state_max_price;

      this.restaurant = object.attributes.restaurant ?? this.restaurant;
      this.bar_code = object.attributes.bar_code ?? this.bar_code;
      this.description = object.attributes.description ?? this.description;
      this.short_description =
        object.attributes.short_description ?? this.short_description;
      this.booking_active =
        object.attributes.booking_active ?? this.booking_active;
      this.booking_fee = object.attributes.booking_fee ?? this.booking_fee;
      this.about = object.attributes.about ?? this.about;
      this.booking_email =
        object.attributes.booking_email ?? this.booking_email;

      this.slogan = object.attributes.slogan ?? this.slogan;
      this.mission = object.attributes.mission ?? this.mission;
      this.vision = object.attributes.vision ?? this.vision;
      this.contact_email =
        object.attributes.contact_email ?? this.contact_email;
      this.support_email =
        object.attributes.support_email ?? this.support_email;
      this.zip_code = object.attributes.zip_code ?? this.zip_code;
      this.address = object.attributes.address ?? this.address;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...this.getWebLinksPlainAttributes(),
      ...(this.name && { name: this.name }),
      ...(this.slug && { slug: this.slug }),
      ...(this.img_logo && { img_logo: this.img_logo }),
      ...(this.img_cover && { img_cover: this.img_cover }),
      ...(this.restaurant && { restaurant: this.restaurant }),
      ...(this.bar_code && { bar_code: this.bar_code }),
      ...(this.description && { description: this.description }),
      ...(this.short_description && {
        short_description: this.short_description,
      }),
      booking_active: this.booking_active,
      booking_fee: this.booking_fee,
      ...(this.about && { about: this.about }),
      ...(this.booking_email && { booking_email: this.booking_email }),
      ...(this.slogan && { slogan: this.slogan }),
      ...(this.mission && { mission: this.mission }),
      ...(this.vision && { vision: this.vision }),
      ...(this.contact_email && { contact_email: this.contact_email }),
      ...(this.support_email && { support_email: this.support_email }),
      ...(this.zip_code && { zip_code: this.zip_code }),
      ...(this.address && { address: this.address }),
    };
  }

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
