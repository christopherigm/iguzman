import { Signal, signal } from '@preact-signals/safe-react';
import { Languages } from '../interfaces/system-interface';
import { SaveCookie } from '../lib/cookie-handler';
import GetBooleanFromString from '../lib/get-boolean-from-string';

export abstract class CachedValues {
  private _language: Signal<Languages> = signal('en');
  private _darkMode: Signal<boolean> = signal(false);
  private _devMode: Signal<boolean> = signal(false);

  public parseCookies(object: any) {
    if (object) {
      this.language = object.language ?? this.language;
      this.darkMode = GetBooleanFromString(object.darkMode);
      this.devMode = GetBooleanFromString(object.devMode);
    }
  }

  public getPlainObject(): any {
    return {
      language: this.language,
      darkMode: this.darkMode,
      devMode: this.devMode,
    };
  }

  public setDataFromPlainObject(object: any) {
    if (object) {
      this.language =
        object.defaultLanguage ?? object.language ?? this.language;
      this.darkMode = object.darkMode ?? this.darkMode;
      this.devMode = object.devMode ?? this.devMode;
    }
  }

  public get language() {
    return this._language.value;
  }
  public set language(value) {
    this._language.value = value;
  }

  public get darkMode() {
    return this._darkMode.value;
  }
  public set darkMode(value) {
    this._darkMode.value = value;
  }

  public get devMode() {
    return this._devMode.value;
  }
  public set devMode(value) {
    this._devMode.value = value;
  }
}

export abstract class EnvironmentVariables extends CachedValues {
  private _hostName: Signal<string> = signal('');
  private _URLBase: Signal<string> = signal('');
  private _K8sURLBase: Signal<string> = signal('');
  private _defaultLanguage: Signal<string> = signal('');
  private _logo: Signal<string> = signal('');
  private _loginEnabled: Signal<boolean> = signal(false);
  private _cartEnabled: Signal<boolean> = signal(false);
  private _favoritesEnabled: Signal<boolean> = signal(false);
  private _ordersEnabled: Signal<boolean> = signal(false);
  private _version: Signal<string> = signal('');
  private _isLoading: Signal<boolean> = signal(false);

  constructor() {
    super();
    this.hostName = process.env.HOSTNAME ?? 'localhost';
    this.URLBase = process.env.URL_BASE ?? 'http://127.0.0.1:3000';
    this.K8sURLBase = process.env.K8S_URL_BASE ?? 'http://127.0.0.1:3000';
    this.defaultLanguage = process.env.DEFAULT_LANGUAGE ?? '';
    this.logo = process.env.LOGO ?? '/images/logo.jpg';
    this.loginEnabled = GetBooleanFromString(process.env.LOGIN_ENABLED ?? '');
    this.cartEnabled = GetBooleanFromString(process.env.CART_ENABLED ?? '');
    this.favoritesEnabled = GetBooleanFromString(
      process.env.FAVORITES_ENABLED ?? ''
    );
    this.ordersEnabled = GetBooleanFromString(process.env.ORDERS_ENABLED ?? '');
    this.version = process.env.VERSION ?? '0.0.1';
  }

  public switchLoading(v: boolean): void {
    this.isLoading = v;
  }

  public setDataFromPlainObject(object: any) {
    if (object) {
      this.hostName = object.hostName ?? this.hostName;
      this.URLBase = object.URLBase ?? this.URLBase;
      this.K8sURLBase = object.K8sURLBase ?? this.K8sURLBase;
      this.defaultLanguage = object.defaultLanguage ?? this.defaultLanguage;
      this.logo = object.logo ?? this.logo;
      this.loginEnabled = object.loginEnabled ?? this.loginEnabled;
      this.cartEnabled = object.cartEnabled ?? this.cartEnabled;
      this.favoritesEnabled = object.favoritesEnabled ?? this.favoritesEnabled;
      this.ordersEnabled = object.ordersEnabled ?? this.ordersEnabled;
      this.version = object.version ?? this.version;
      this.isLoading = object.isLoading ?? this.isLoading;
      super.setDataFromPlainObject({
        ...object,
        defaultLanguage: this.defaultLanguage,
      });
    }
  }

  public getPlainObject(): any {
    return {
      ...super.getPlainObject(),
      hostName: this.hostName,
      URLBase: this.URLBase,
      K8sURLBase: this.K8sURLBase,
      defaultLanguage: this.defaultLanguage,
      logo: this.logo,
      loginEnabled: this.loginEnabled,
      cartEnabled: this.cartEnabled,
      favoritesEnabled: this.favoritesEnabled,
      ordersEnabled: this.ordersEnabled,
      version: this.version,
    };
  }

  public get hostName() {
    return this._hostName.value;
  }
  public set hostName(value) {
    this._hostName.value = value;
  }

  public get URLBase() {
    return this._URLBase.value;
  }
  public set URLBase(value) {
    this._URLBase.value = value;
  }

  public get K8sURLBase() {
    return this._K8sURLBase.value;
  }
  public set K8sURLBase(value) {
    this._K8sURLBase.value = value;
  }

  public get defaultLanguage() {
    return this._defaultLanguage.value;
  }
  public set defaultLanguage(value) {
    this._defaultLanguage.value = value;
  }

  public get logo() {
    return this._logo.value;
  }
  public set logo(value) {
    this._logo.value = value;
  }

  public get loginEnabled() {
    return this._loginEnabled.value;
  }
  public set loginEnabled(value) {
    this._loginEnabled.value = value;
  }

  public get cartEnabled() {
    return this._cartEnabled.value;
  }
  public set cartEnabled(value) {
    this._cartEnabled.value = value;
  }

  public get favoritesEnabled() {
    return this._favoritesEnabled.value;
  }
  public set favoritesEnabled(value) {
    this._favoritesEnabled.value = value;
  }

  public get ordersEnabled() {
    return this._ordersEnabled.value;
  }
  public set ordersEnabled(value) {
    this._ordersEnabled.value = value;
  }

  public get version() {
    return this._version.value;
  }
  public set version(value) {
    this._version.value = value;
  }

  public get isLoading() {
    return this._isLoading.value;
  }
  public set isLoading(value) {
    this._isLoading.value = value;
  }
}
export abstract class BaseSystem extends EnvironmentVariables {
  protected type: string = 'System';
  private _paths: Signal<Array<string>> = signal([]);

  public switchTheme(): void {
    this.darkMode = !this.darkMode;
    SaveCookie('darkMode', String(this.darkMode), this.paths);
  }

  public switchDevMode(): void {
    this.devMode = !this.devMode;
    SaveCookie('devMode', String(this.devMode), this.paths);
  }

  public getPlainObject(): any {
    return {
      ...super.getPlainObject(),
      paths: this.paths,
    };
  }

  public setDataFromPlainObject(object: any) {
    if (object) {
      super.setDataFromPlainObject(object);
      this.paths = object.paths ?? this.paths;
    }
  }

  public get paths() {
    return this._paths.value;
  }
  public set paths(value) {
    this._paths.value = value;
  }
}
