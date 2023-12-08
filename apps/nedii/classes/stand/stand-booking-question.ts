import { Signal, signal } from '@preact/signals-react';
import { CommonFields } from 'utils';

export default class StandBookingQuestion {
  public static instance: StandBookingQuestion;
  protected type = 'StandBookingQuestion';
  private _id: Signal<number> = signal(0);
  public attributes: StandBookingQuestionAttributes =
    new StandBookingQuestionAttributes();
  public relationships: StandBookingQuestionRelationships =
    new StandBookingQuestionRelationships();

  public static getInstance(): StandBookingQuestion {
    return StandBookingQuestion.instance || new StandBookingQuestion();
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandBookingQuestionAttributes extends CommonFields {
  private _name: Signal<string> = signal('');
  private _open_answer: Signal<boolean> = signal(false);

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

  public get options() {
    return this._options.value;
  }
  public set options(value) {
    this._options.value = value;
  }
}

// Booking Question Options
export class StandBookingQuestionOption {
  public static instance: StandBookingQuestionOption;
  protected type = 'StandBookingQuestionOption';
  private _id: Signal<number> = signal(0);
  public attributes: StandBookingQuestionOptionAttributes =
    new StandBookingQuestionOptionAttributes();

  public static getInstance(): StandBookingQuestionOption {
    return (
      StandBookingQuestionOption.instance || new StandBookingQuestionOption()
    );
  }

  public get id() {
    return this._id.value;
  }
  public set id(value) {
    this._id.value = value;
  }
}

class StandBookingQuestionOptionAttributes extends CommonFields {
  private _value: Signal<string> = signal('');

  public get value() {
    return this._value.value;
  }
  public set value(value) {
    this._value.value = value;
  }
}
