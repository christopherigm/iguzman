'use-client';

import { Signal, signal } from '@preact-signals/safe-react';
import { SubstractDates } from '@repo/utils';
//https://ffmpegwasm.netlify.app/docs/getting-started/usage/
//
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  API,
  GetLocalStorageData,
  SetLocalStorageData,
  isYoutube,
  isInstagram,
  isTiktok,
  isFacebook,
  isTwitter,
  isPinterest,
} from '@repo/utils';

type Status =
  | 'downloading'
  | 'none'
  | 'ready'
  | 'error'
  | 'processing-h264'
  | 'deleted'
  | 'canceled';
export type VideoType =
  | 'audio'
  | 'youtube'
  | 'instagram'
  | 'tiktok'
  | 'facebook'
  | 'twitter'
  | 'pinterest';
export type DownloadOptions = {
  justAudio: boolean;
  hdTikTok: boolean;
};

export default class Item {
  public static instance: Item;
  private _id: Signal<string> = signal('');
  private _URLBase: Signal<string> = signal('');
  private _message: Signal<string> = signal('');
  private _name: Signal<string> = signal('');
  private _filename: Signal<string> = signal('');
  private _status: Signal<Status> = signal('none');
  private _processingStatus: Signal<string> = signal('');
  private _url: Signal<string> = signal('');
  private _type: Signal<VideoType | null> = signal(null);
  private _blob: Signal<Blob> = signal(new Blob());
  private _error: Signal<string | null> = signal(null);
  private _created: Signal<Date | null> = signal(null);
  private _completed: Signal<Date | null> = signal(null);
  private _justAudio: Signal<boolean> = signal(false);
  private _hdTikTok: Signal<boolean> = signal(false);
  private _processedVideoLink: Signal<string> = signal('');
  private timeout: NodeJS.Timeout = setTimeout(() => {}, 100000);
  private _ffmpeg: FFmpeg | undefined;

  public static getInstance(): Item {
    return Item.instance || new Item();
  }

  private handleResponse(response: Item) {
    this.id = response.id;
    if (response.filename) {
      this.filename = response.filename;
    }
    if (response.status) {
      this.status = response.status;
    }
    if (response.name) {
      this.name = response.name;
    }
    this.message = response.message;
    this.error = response.error;
    this.created = response.created || null;
    this.completed = response.completed || null;
    this.updateLocalStorageItem();
  }

  public setType() {
    if (!this.url || this.type) {
      return;
    }
    if (this.justAudio) {
      this.type = 'audio';
    } else if (isYoutube(this.url)) {
      this.type = 'youtube';
    } else if (isInstagram(this.url)) {
      this.type = 'instagram';
    } else if (isTiktok(this.url)) {
      this.type = 'tiktok';
    } else if (isFacebook(this.url)) {
      this.type = 'facebook';
    } else if (isTwitter(this.url)) {
      this.type = 'twitter';
    } else if (isPinterest(this.url)) {
      this.type = 'pinterest';
    }
  }

  public getVideo(options?: DownloadOptions) {
    if (!this.URLBase || !this.url) {
      return;
    }
    this.setType();
    let force = false;
    if (
      this.status === 'ready' ||
      this.status === 'error' ||
      this.status === 'canceled'
    ) {
      this.status = 'none';
      force = true;
      this.updateLocalStorageItem();
    }
    if (options) {
      this.justAudio = options?.justAudio ?? false;
      this.hdTikTok = options?.hdTikTok ?? false;
    }
    const url = `${this.URLBase}/download-video`;
    let data: any = {
      url: this.url,
      justAudio: this.justAudio,
      hdTikTok: this.hdTikTok,
      force,
    };
    if (this.id) {
      data.id = this.id;
    }
    API.Post({
      url,
      data,
      jsonapi: false,
    })
      .then((response: Item) => {
        this.handleResponse(response);
        this.checkStatus();
      })
      .catch((e) => {
        this.error = e ?? '';
        if (this.error) {
          this.status = 'error';
        }
        this.updateLocalStorageItem();
      });
  }

  public cancelRequest() {
    this.status = 'canceled';
    this.updateLocalStorageItem();
  }

  public clearTimeout() {
    clearTimeout(this.timeout);
  }

  public load(): Promise<void> {
    return new Promise(async (res, _rej) => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      // this.ffmpeg = new FFmpeg();
      this.ffmpeg.on('log', ({ message }) => {
        // messageRef.current.innerHTML = message;
        console.log(message);
        this.processingStatus = message;
      });
      // toBlobURL is used to bypass CORS issue, urls with the same
      // domain can be used directly.
      await this.ffmpeg.load({
        coreURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.js`,
          'text/javascript'
        ),
        wasmURL: await toBlobURL(
          `${baseURL}/ffmpeg-core.wasm`,
          'application/wasm'
        ),
      });
      // setLoaded(true);
      res();
    });
  }

  public checkStatus() {
    this.clearTimeout();
    // console.log('>>> checkStatus');
    // console.log('>>> status:', this.status);
    // console.log('>>> hdTikTok:', this.hdTikTok);
    // if (
    //   this.status === 'ready' &&
    //   // this.videoLink &&
    //   // this.ffmpeg &&
    //   this.hdTikTok
    //   // this.id === '667ee424150ca254e77b1b0f'
    // ) {
    //   console.log('>>> this.videoLink:', this.videoLink);

    //   this.processingStatus = 'started';
    //   this.load()
    //     .then(() => {
    //       fetchFile(this.videoLink)
    //         .then((video) => {
    //           this.processingStatus = 'Writing file';
    //           this.ffmpeg
    //             .writeFile('input.mp4', video)
    //             .then(async (d: boolean) => {
    //               console.log('ffmpeg.writeFile:', d);

    //               // this.url = '';
    //               this.processingStatus = 'Starting processing';

    //               await this.ffmpeg.exec(['-i', 'input.mp4', 'output.mp4']);
    //               const data: any = await this.ffmpeg.readFile('output.mp4');
    //               this.processedVideoLink = URL.createObjectURL(
    //                 new Blob([data.buffer], { type: 'video/mp4' })
    //               );
    //               // console.log('>>> data.buffer', data);
    //               this.processingStatus = 'Done';
    //             })
    //             .catch((e) => console.log('ffmpeg.writeFile [error]:', e));
    //         })
    //         .catch((e) => console.log('fetchFile [error]:', e));
    //     })
    //     .catch((e) => console.log('load [error]:', e));
    //   return;
    // }
    if (
      !this.URLBase ||
      !this.url ||
      this.status === 'ready' ||
      this.status === 'canceled' ||
      this.status === 'deleted' ||
      this.status === 'error'
    ) {
      return;
    }
    // if (this.status === 'error') {
    //   // this.status = 'none';
    //   this.updateLocalStorageItem();
    //   return;
    // }
    if (this.id) {
      API.Get({
        url: `${this.URLBase}/get-videos/${this.id}`,
        jsonapi: false,
      })
        .then((response: Item) => this.handleResponse(response))
        .catch((e) => {
          if (this.id) {
            this.error = e ?? '';
            if (this.error) {
              this.status = 'error';
            }
            this.completed = e.completed || this.completed;
            this.updateLocalStorageItem();
          }
        })
        .finally(
          () => (this.timeout = setTimeout(() => this.checkStatus(), 2000))
        );
    } else if (this.url) {
      API.Post({
        url: `${this.URLBase}/get-video-name`,
        jsonapi: false,
        data: {
          url: this.url,
          justAudio: this.justAudio,
          hdTikTok: this.hdTikTok,
        },
      })
        .then((response: Item) => this.handleResponse(response))
        .catch((e) => {
          this.error = e ?? '';
          if (this.error) {
            this.status = 'error';
          }
          this.updateLocalStorageItem();
        })
        .finally(
          () => (this.timeout = setTimeout(() => this.checkStatus(), 2000))
        );
    }
  }

  public updateLocalStorageItem() {
    const items: Array<any> = this.getItemFromLocalStorage();
    for (let i = 0; i < items.length; i++) {
      if (items[i].id === this.id || items[i].url === this.url) {
        items[i] = this.getItemToSaveInLocalStorage();
      }
    }
    SetLocalStorageData('items', JSON.stringify(items));
  }

  public getItemFromLocalStorage(): Array<Item> {
    let cachedItems: any = GetLocalStorageData('items');
    if (cachedItems) {
      cachedItems = (JSON.parse(cachedItems) as Array<any>) ?? [];
      return cachedItems;
    }
    return [];
  }

  public getItemToSaveInLocalStorage() {
    return {
      id: this.id,
      URLBase: this.URLBase,
      name: this.name,
      filename: this.filename,
      status: this.status,
      url: this.url,
      type: this.type,
      error: this.error,
      created: this.created,
      completed: this.completed,
      justAudio: this.justAudio,
      hdTikTok: this.hdTikTok,
    };
  }

  public get ffmpeg(): FFmpeg {
    if (!this._ffmpeg) {
      this._ffmpeg = new FFmpeg();
    }
    return this._ffmpeg;
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }

  public get URLBase() {
    return this._URLBase.value;
  }
  public set URLBase(value) {
    this._URLBase.value = value;
  }

  public get message() {
    return this._message.value;
  }
  public set message(value) {
    this._message.value = value;
  }

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get filename() {
    return this._filename.value;
  }
  public set filename(value) {
    this._filename.value = value;
  }

  public get status() {
    return this._status.value;
  }
  public set status(value) {
    this._status.value = value;
  }

  public get processingStatus() {
    return this._processingStatus.value;
  }
  public set processingStatus(value) {
    this._processingStatus.value = value;
  }

  public get url() {
    return this._url.value;
  }
  public set url(value) {
    this._url.value = value;
  }

  public get blob() {
    return this._blob.value;
  }
  public set blob(value) {
    this._blob.value = value;
  }

  public get error() {
    return this._error.value;
  }
  public set error(value) {
    this._error.value = value;
  }

  public get created() {
    return this._created.value;
  }
  public set created(value) {
    this._created.value = value;
  }

  public get completed() {
    return this._completed.value;
  }
  public set completed(value) {
    this._completed.value = value;
  }

  public get justAudio() {
    return this._justAudio.value;
  }
  public set justAudio(value) {
    this._justAudio.value = value;
  }

  public get hdTikTok() {
    return this._hdTikTok.value;
  }
  public set hdTikTok(value) {
    this._hdTikTok.value = value;
  }

  public get videoLink() {
    let videoLink = '';
    if (this.URLBase && this.id && this.status === 'ready') {
      videoLink = this.filename
        ? `${this.URLBase}/media/${this.filename}`
        : `${this.URLBase}/media/${this.id}.${this.justAudio ? 'm4a' : 'mp4'}`;
      videoLink = videoLink.replaceAll('api/', '');
    }
    return videoLink;
  }

  public get completedTime(): string {
    let time = '';
    if (this.created && this.completed) {
      const diff = SubstractDates(
        new Date(this.completed),
        new Date(this.created)
      );
      const seconds = diff.getSeconds();
      const minutesToSeconds = diff.getMinutes() * 60;
      time = (seconds + minutesToSeconds).toString();
    }
    return time;
  }

  public get processedVideoLink() {
    return this._processedVideoLink.value;
  }
  public set processedVideoLink(value) {
    this._processedVideoLink.value = value;
  }

  public get type() {
    return this._type.value;
  }
  public set type(value) {
    this._type.value = value;
  }
}

export const item = signal<Item>(Item.getInstance()).value;
