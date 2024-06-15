import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, API } from '@repo/utils';

export default class SurveyQuestion {
  public static instance: SurveyQuestion;
  protected type = 'SurveyQuestion';
  protected endpoint = 'v1/stand-survey/';
  private _id: Signal<number> = signal(0);
  private _URLBase: Signal<string> = signal('');
  private _access: Signal<string> = signal('');
  public attributes: SurveyQuestionAttributes = new SurveyQuestionAttributes();

  public static getInstance(): SurveyQuestion {
    return SurveyQuestion.instance || new SurveyQuestion();
  }

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
  }

  public getPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
    };
  }

  public save(): Promise<void> {
    return new Promise((res, rej) => {
      const url = `${this.URLBase}/${this.endpoint}`;
      const data = {
        url,
        jwt: this.access,
        data: this.getPlainObject(),
      };
      API.Post(data)
        .then((response) => {
          if (response.errors && response.errors.length) {
            return rej(response.errors);
          }
          this.id = Number(response.data?.id ?? this.id);
          return res();
        })
        .catch((error) => rej(error));
    });
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

  public get access() {
    return this._access.value;
  }
  public set access(value) {
    this._access.value = value;
  }
}

class SurveyQuestionAttributes extends CommonFields {
  private _name: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    this.name = object.attributes.alias ?? this.name;
  }

  public getPlainAttributes(): any {
    return {
      ...(this.name && {
        name: this.name,
      }),
    };
  }

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }
}

export const surveyQuestion = signal<SurveyQuestion>(
  SurveyQuestion.getInstance()
).value;
