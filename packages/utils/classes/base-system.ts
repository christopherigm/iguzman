import { Signal, signal } from '@preact/signals-react';
import { Mixin } from 'ts-mixer';
import { Languages } from '../interfaces/system-interface';
import { SaveCookie } from '../lib/cookie-handler';
import GetBooleanFromString from '../lib/get-boolean-from-string';
import { GetLocalStorageData, SetLocalStorageData } from '../lib/local-storage';
import { BaseUser } from './base-user';

export class EnvironmentVariables {
  private _hostName: Signal<string> = signal('');
  private _URLBase: Signal<string> = signal('');
  private _K8sURLBase: Signal<string> = signal('');
  private _defaultLanguage: Signal<string> = signal('');
  private _loginEnabled: Signal<boolean> = signal(false);
  private _cartEnabled: Signal<boolean> = signal(false);
  private _favoritesEnabled: Signal<boolean> = signal(false);
  private _ordersEnabled: Signal<boolean> = signal(false);
  private _version: Signal<string> = signal('');
  private _isLoading: Signal<boolean> = signal(false);

  constructor() {
    this.hostName = process.env.HOSTNAME ?? 'localhost';
    this.URLBase = process.env.URL_BASE ?? 'http://127.0.0.1:3000';
    this.K8sURLBase = process.env.K8S_URL_BASE ?? 'http://127.0.0.1:3000';
    this.defaultLanguage = process.env.DEFAULT_LANGUAGE ?? 'en';
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
export class CachedValues {
  private _language: Signal<Languages> = signal('en');
  private _darkMode: Signal<boolean> = signal(false);
  private _devMode: Signal<boolean> = signal(false);

  public parseCookies(cookies?: any) {
    this.language = cookies.language ?? 'en';
    this.darkMode = GetBooleanFromString(cookies.darkMode);
    this.devMode = GetBooleanFromString(cookies.devMode);
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

export class BaseSystem extends Mixin(EnvironmentVariables, CachedValues) {
  public static instance: BaseSystem;
  private _paths: Signal<Array<string>> = signal([]);

  public static getInstance(): BaseSystem {
    return BaseSystem.instance || new BaseSystem();
  }

  constructor() {
    super();
    this.language = this.language ?? this.defaultLanguage;
  }

  public switchTheme(): void {
    this.darkMode = !this.darkMode;
    SaveCookie('darkMode', String(this.darkMode), this.paths);
  }

  public switchDevMode(): void {
    this.devMode = !this.devMode;
    SaveCookie('devMode', String(this.devMode), this.paths);
  }

  public get paths() {
    return this._paths.value;
  }
  public set paths(value) {
    this._paths.value = value;
  }
}
