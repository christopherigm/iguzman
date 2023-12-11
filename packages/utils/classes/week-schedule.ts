import { Signal, signal } from "@preact/signals-react";

type WeekDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
type Time =`${number | ''}${number}:${number}${number}`;
type StringArray = {
  [index: string]: {
    open: Time;
    close: Time;
  };
};

export default class WeekSchedule {
  protected readonly _defaultOpenTime: Time = '9:00';
  protected readonly _defaultCloseTime: Time = '17:00';
  private _always_open: Signal<boolean> = signal(false);
  private _days: Signal<StringArray> = signal({});

  private readDayValue(
      day: WeekDay,
      open: boolean = false,
    ): Time {
    if (this._days.value[day] === undefined) {
      this._days.value[day] = {
        open: this._defaultOpenTime,
        close: this._defaultCloseTime,
      }
    }
    return open ? this._days.value[day].open : this._days.value[day].close;
  }

  private setDayValue(
      day: WeekDay,
      value: Time,
      open: boolean = false,
    ) {
    if (this._days.value[day] === undefined) {
      this._days.value[day] = {
        open: this._defaultOpenTime,
        close: this._defaultCloseTime,
      }
    }
    if (open) {
      this._days.value[day].open = value;
    } else {
      this._days.value[day].close = value;
    }
  }

  public get always_open() {
    return this._always_open.value;
  }
  public set always_open(value) {
    this._always_open.value = value;
  }

  public get monday_open() {
    return this.readDayValue('monday', true);
  }
  public set monday_open(value) {
    this.setDayValue('monday', value, true);
  }
  public get monday_close() {
    return this.readDayValue('monday');
  }
  public set monday_close(value) {
    this.setDayValue('monday', value);
  }

  public get tuesday_open() {
    return this.readDayValue('tuesday', true);
  }
  public set tuesday_open(value) {
    this.setDayValue('tuesday', value, true);
  }
  public get tuesday_close() {
    return this.readDayValue('tuesday');
  }
  public set tuesday_close(value) {
    this.setDayValue('tuesday', value);
  }

  public get wednesday_open() {
    return this.readDayValue('wednesday', true);
  }
  public set wednesday_open(value) {
    this.setDayValue('wednesday', value, true);
  }
  public get wednesday_close() {
    return this.readDayValue('wednesday');
  }
  public set wednesday_close(value) {
    this.setDayValue('wednesday', value);
  }

  public get thursday_open() {
    return this.readDayValue('thursday', true);
  }
  public set thursday_open(value) {
    this.setDayValue('thursday', value, true);
  }
  public get thursday_close() {
    return this.readDayValue('thursday');
  }
  public set thursday_close(value) {
    this.setDayValue('thursday', value);
  }

  public get friday_open() {
    return this.readDayValue('friday', true);
  }
  public set friday_open(value) {
    this.setDayValue('friday', value, true);
  }
  public get friday_close() {
    return this.readDayValue('friday');
  }
  public set friday_close(value) {
    this.setDayValue('friday', value);
  }

  public get saturday_open() {
    return this.readDayValue('saturday', true);
  }
  public set saturday_open(value) {
    this.setDayValue('saturday', value, true);
  }
  public get saturday_close() {
    return this.readDayValue('saturday');
  }
  public set saturday_close(value) {
    this.setDayValue('saturday', value);
  }

  public get sunday_open() {
    return this.readDayValue('sunday', true);
  }
  public set sunday_open(value) {
    this.setDayValue('sunday', value, true);
  }
  public get sunday_close() {
    return this.readDayValue('sunday');
  }
  public set sunday_close(value) {
    this.setDayValue('sunday', value);
  }
}
