import { Signal, signal } from '@preact-signals/safe-react';

export default class StandAttributesContact {
  private _contact_email: Signal<string> = signal('');
  private _support_email: Signal<string> = signal('');
  private _zip_code: Signal<string> = signal('');
  private _address: Signal<string> = signal('');

  public get contact_email() {
    return this._contact_email.value;
  }
  public set contact_email(value) {
    this._contact_email.value = value;
  }

  public get support_email() {
    return this._support_email.value;
  }
  public set support_email(value) {
    this._support_email.value = value;
  }

  public get zip_code() {
    return this._zip_code.value;
  }
  public set zip_code(value) {
    this._zip_code.value = value;
  }

  public get address() {
    return this._address.value;
  }
  public set address(value) {
    this._address.value = value;
  }
}
