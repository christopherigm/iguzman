import { signal } from '@preact-signals/safe-react';
import BaseItemPicture from 'classes/base-item-picture';

export default class StandPicture extends BaseItemPicture {
  public static instance: StandPicture;
  public type = 'StandPicture';
  public endpoint = 'v1/stand-pictures/';

  public static getInstance(): StandPicture {
    return StandPicture.instance || new StandPicture();
  }
}

export const standPicture = signal<StandPicture>(
  StandPicture.getInstance()
).value;
