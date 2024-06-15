import { Signal, signal } from '@preact/signals-react';

export default class WebLinks {
  private _web_link: Signal<string> = signal('');
  private _facebook_link: Signal<string> = signal('');
  private _twitter_link: Signal<string> = signal('');
  private _instagram_link: Signal<string> = signal('');
  private _linkedin_link: Signal<string> = signal('');
  private _google_link: Signal<string> = signal('');
  private _youtube_link: Signal<string> = signal('');
  private _twitch_link: Signal<string> = signal('');

  public getWebLinksPlainAttributes() {
    return {
      ...(this.web_link && { web_link: this.web_link }),
      ...(this.facebook_link && { facebook_link: this.facebook_link }),
      ...(this.twitter_link && { twitter_link: this.twitter_link }),
      ...(this.instagram_link && { instagram_link: this.instagram_link }),
      ...(this.linkedin_link && { linkedin_link: this.linkedin_link }),
      ...(this.google_link && { google_link: this.google_link }),
      ...(this.youtube_link && { youtube_link: this.youtube_link }),
      ...(this.twitch_link && { twitch_link: this.twitch_link }),
    };
  }

  public setWebLinksFromPlainObject(object: any) {
    this.web_link = object.web_link ?? this.web_link;
    this.facebook_link = object.facebook_link ?? this.facebook_link;
    this.twitter_link = object.twitter_link ?? this.twitter_link;
    this.instagram_link = object.instagram_link ?? this.instagram_link;
    this.linkedin_link = object.linkedin_link ?? this.linkedin_link;
    this.google_link = object.google_link ?? this.google_link;
    this.youtube_link = object.youtube_link ?? this.youtube_link;
    this.twitch_link = object.twitch_link ?? this.twitch_link;
  }

  public get web_link() {
    return this._web_link.value;
  }
  public set web_link(value) {
    this._web_link.value = value;
  }

  public get facebook_link() {
    return this._facebook_link.value;
  }
  public set facebook_link(value) {
    this._facebook_link.value = value;
  }

  public get twitter_link() {
    return this._twitter_link.value;
  }
  public set twitter_link(value) {
    this._twitter_link.value = value;
  }

  public get instagram_link() {
    return this._instagram_link.value;
  }
  public set instagram_link(value) {
    this._instagram_link.value = value;
  }

  public get linkedin_link() {
    return this._linkedin_link.value;
  }
  public set linkedin_link(value) {
    this._linkedin_link.value = value;
  }

  public get google_link() {
    return this._google_link.value;
  }
  public set google_link(value) {
    this._google_link.value = value;
  }

  public get youtube_link() {
    return this._youtube_link.value;
  }
  public set youtube_link(value) {
    this._youtube_link.value = value;
  }

  public get twitch_link() {
    return this._twitch_link.value;
  }
  public set twitch_link(value) {
    this._twitch_link.value = value;
  }
}
