import { Signal, signal } from "@preact/signals-react";

type DateEnum = 'created' | 'modified';
const months = [
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'
];

export default class TimeFields {
  private _created: Signal<Date> = signal(new Date());
  private _modified: Signal<Date> = signal(new Date());

  public get created() {
    return this._created.value;
  }
  public set created(value: Date) {
    this._created.value = value;
  }

  public get modified() {
    return this._modified.value;
  }
  public set modified(value: Date) {
    this._modified.value = value;
  }
  
  public time12HoursFormat(type: DateEnum): string  {
    const date: Date = this[type];
    let h = date.getHours();
    const m = date.getMinutes();
    let pmam = 'am';
    if (h === 12) {
      pmam = 'pm';
    } else if (h > 12) {
      h = h - 12;
      pmam = 'pm';
    }
    return `${h > 9 ? h : `0${h}`}:${m > 9 ? m : `0${m}`}${pmam}`;
  }

  public humanReadableDate(
      type: DateEnum,
      shortFormat: boolean = false,
      includeTime: boolean = true,
      showYear: boolean = true,
    ): string {
    const date: Date = this[type];
    const month = shortFormat ?
      date.getMonth() + 1 :
      months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    let h = date.getHours();
    const m = date.getMinutes();
    const time = ` - ${h > 9 ? h : `0${h}`}:${m > 9 ? m : `0${m}`}hrs`;
    return shortFormat ? 
      `${month}/${day}${showYear ? `/${year}` : ''}${includeTime ? time : ''}` :
      `${month} ${day}, ${year}${includeTime ? time : ''}`;
  }
}
