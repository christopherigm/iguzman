import { Signal, signal } from "@preact/signals-react";
import StandAttributes from './stand-attributes';
import StandRelationships from './stand-relationships';

export default class Stand {
  public static instance: Stand;
  protected type: string = 'Stand';
  private _id: Signal<number> = signal(0);
  public attributes: StandAttributes = new StandAttributes();
  public relationships: StandRelationships = new StandRelationships();

  public static getInstance(): Stand {
    return this.instance || new Stand();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value: number) {
    this._id.value = value;
  }
};

export const stand = signal<Stand>(Stand.getInstance()).value;
