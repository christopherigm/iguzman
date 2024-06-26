import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, API, BaseAPIClass } from '@repo/utils';

export default class SurveyQuestion extends BaseAPIClass {
  public static instance: SurveyQuestion;
  public type = 'SurveyQuestion';
  public endpoint = 'v1/stand-survey/';
  public attributes: SurveyQuestionAttributes = new SurveyQuestionAttributes();
  public relationships = '';

  public static getInstance(): SurveyQuestion {
    return SurveyQuestion.instance || new SurveyQuestion();
  }
}

class SurveyQuestionAttributes extends CommonFields {
  private _name: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    super.setAttributesFromPlainObject(object);
    this.name = object.attributes.alias ?? this.name;
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
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
