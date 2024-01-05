import { signal } from '@preact-signals/safe-react';
import { BaseSystem } from 'utils';

export type Exposure = 'basic' | 'medium' | 'high' | 'full';

export default class System extends BaseSystem {
  public static instance: System;

  public static getInstance(): System {
    return System.instance || new System();
  }

  constructor() {
    super();
    this.paths = ['/', '/account'];
  }

  public getServerSideProps(): Object {
    return {
      hostName: this.hostName,
      URLBase: this.URLBase,
      K8sURLBase: this.K8sURLBase,
      defaultLanguage: this.defaultLanguage,
      loginEnabled: this.loginEnabled,
      cartEnabled: this.cartEnabled,
      favoritesEnabled: this.favoritesEnabled,
      ordersEnabled: this.ordersEnabled,
      version: this.version,
      isLoading: this.isLoading,
      language: this.language,
      darkMode: this.darkMode,
      devMode: this.devMode,
    };
  }

  public setServerSideProps(props: any): void {
    this.hostName = props.hostName ?? this.hostName;
    this.URLBase = props.URLBase ?? this.URLBase;
    this.K8sURLBase = props.K8sURLBase ?? this.K8sURLBase;
    this.defaultLanguage = props.defaultLanguage ?? this.defaultLanguage;
    this.loginEnabled = props.loginEnabled ?? this.loginEnabled;
    this.cartEnabled = props.cartEnabled ?? this.cartEnabled;
    this.favoritesEnabled = props.favoritesEnabled ?? this.favoritesEnabled;
    this.ordersEnabled = props.ordersEnabled ?? this.ordersEnabled;
    this.version = props.version ?? this.version;
    this.isLoading = props.isLoading ?? this.isLoading;
    this.language = props.language ?? this.language;
    this.darkMode = props.darkMode ?? this.darkMode;
    this.devMode = props.devMode ?? this.devMode;
  }
}

export const system: System = signal<System>(System.getInstance()).value;
