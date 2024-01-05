import { Signal, signal } from '@preact/signals-react';
import { CommonFields } from 'utils';

export default class SurveyQuestion {
  public static instance: SurveyQuestion;
  protected type = 'SurveyQuestion';
  private _id: Signal<number> = signal(0);
  public attributes: SurveyQuestionAttributes = new SurveyQuestionAttributes();

  public static getInstance(): SurveyQuestion {
    return SurveyQuestion.instance || new SurveyQuestion();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class SurveyQuestionAttributes extends CommonFields {
  private _name: Signal<string> = signal('');

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }
}
