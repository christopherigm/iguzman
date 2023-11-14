import { Signal, signal } from "@preact/signals-react";

type Type = 'web' | 'facebook' | 'twitter' | 'instagram' | 'linkedin' |
  'google' | 'youtube' | 'twitch';
type Link =`https://${string}` | '';
type Dictionary = {
  [index: string]: Link;
};

export default class WebLinks {
  private _links: Signal<Dictionary> = signal({});

  private readLinkValue(type: Type): Link {
    if (this._links.value[type] === undefined) {
      this._links.value[type] = '';
    }
    return this._links.value[type];
  }

  private setLinkValue(type: Type, value: Link) {
    if (this._links.value[type] === undefined) {
      this._links.value[type] = '';
    }
    this._links.value[type] = value;
  }

  public get web_link() {
    return this.readLinkValue('web');
  }
  public set web_link(value: Link) {
    this.setLinkValue('web', value);
  }

  public get facebook_link() {
    return this.readLinkValue('facebook');
  }
  public set facebook_link(value: Link) {
    this.setLinkValue('facebook', value);
  }

  public get twitter_link() {
    return this.readLinkValue('twitter');
  }
  public set twitter_link(value: Link) {
    this.setLinkValue('twitter', value);
  }

  public get instagram_link() {
    return this.readLinkValue('instagram');
  }
  public set instagram_link(value: Link) {
    this.setLinkValue('instagram', value);
  }

  public get linkedin_link() {
    return this.readLinkValue('linkedin');
  }
  public set linkedin_link(value: Link) {
    this.setLinkValue('linkedin', value);
  }

  public get google_link() {
    return this.readLinkValue('google');
  }
  public set google_link(value: Link) {
    this.setLinkValue('google', value);
  }

  public get youtube_link() {
    return this.readLinkValue('youtube');
  }
  public set youtube_link(value: Link) {
    this.setLinkValue('youtube', value);
  }

  public get twitch_link() {
    return this.readLinkValue('twitch');
  }
  public set twitch_link(value: Link) {
    this.setLinkValue('twitch', value);
  }
}
