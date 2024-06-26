import { Signal, signal } from '@preact-signals/safe-react';
import { BaseAPIClass, CommonFields, API } from '@repo/utils';

export default class StandBookingQuestion extends BaseAPIClass {
  public static instance: StandBookingQuestion;
  public type = 'StandBookingQuestion';
  public endpoint = 'v1/stand-booking-questions/';
  public attributes: StandBookingQuestionAttributes =
    new StandBookingQuestionAttributes();
  public relationships: StandBookingQuestionRelationships =
    new StandBookingQuestionRelationships();

  public static getInstance(): StandBookingQuestion {
    return StandBookingQuestion.instance || new StandBookingQuestion();
  }
}

class StandBookingQuestionAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _open_answer: Signal<boolean> = signal(false);

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.name = object.attributes.alias ?? this.name;
      this.open_answer = object.attributes.open_answer;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.name && {
        name: this.name,
      }),
      open_answer: this.open_answer,
    };
  }

  public get name() {
    return this._name.value;
  }
  public set name(value) {
    this._name.value = value;
  }

  public get open_answer() {
    return this._open_answer.value;
  }
  public set open_answer(value) {
    this._open_answer.value = value;
  }
}

class StandBookingQuestionRelationships {
  public _options: Signal<{ data: Array<StandBookingQuestionOption> }> = signal(
    {
      data: [],
    }
  );

  public setRelationshipsFromPlainObject(object: any) {
    if (object.relationships) {
      if (object.relationships.options?.data) {
        const options: Array<StandBookingQuestionOption> = [];
        object.relationships?.options?.data.forEach((i: any) => {
          const newOption = new StandBookingQuestionOption();
          newOption.setDataFromPlainObject(i);
          options.push(newOption);
        });
        this.options.data = options;
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      options: this.options,
    };
  }

  public get options() {
    return this._options.value;
  }
  public set options(value) {
    this._options.value = value;
  }
}

// Booking Question Options
export class StandBookingQuestionOption extends BaseAPIClass {
  public static instance: StandBookingQuestionOption;
  public type = 'StandBookingQuestionOption';
  public endpoint = 'v1/stand-booking-question-options/';
  public attributes: StandBookingQuestionOptionAttributes =
    new StandBookingQuestionOptionAttributes();
  public relationships = null;

  public static getInstance(): StandBookingQuestionOption {
    return (
      StandBookingQuestionOption.instance || new StandBookingQuestionOption()
    );
  }
}

class StandBookingQuestionOptionAttributes extends CommonFields {
  private _value: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.value = object.attributes.value ?? this.value;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.value && {
        value: this.value,
      }),
    };
  }

  public get value() {
    return this._value.value;
  }
  public set value(value) {
    this._value.value = value;
  }
}

export const standBookingQuestion = signal<StandBookingQuestion>(
  StandBookingQuestion.getInstance()
).value;
