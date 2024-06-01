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

  public setDataFromPlainObject(object: any) {
    this.id = Number(object.id ?? 0) ?? this.id;
    this.attributes.setAttributesFromPlainObject(object);
    this.relationships.setRelationshipsFromPlainObject(
      object,
      this.URLBase,
      this.access
    );
  }

  public getPlainObject(): any {
    return {
      ...(this.id && { id: this.id }),
      type: this.type,
      attributes: this.attributes.getPlainAttributes(),
      relationships: this.relationships.getPlainRelationships(),
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
          console.log(`Resource ${this.type} added:`, response);
          if (response.errors && response.errors.length) {
            return rej(response.errors);
          }
          this.id = response.data?.id ?? this.id;
          return res();
        })
        .catch((error) => rej(error));
    });
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

  public setRelationshipsFromPlainObject(
    object: any,
    URLBase = '',
    access = ''
  ) {
    if (object.relationships) {
      if (object.relationships.options?.data) {
        const options: Array<StandBookingQuestionOption> = [];
        object.relationships?.options?.data.forEach((i: any) => {
          const newOption = new StandBookingQuestionOption();
          newOption.URLBase = URLBase;
          newOption.access = access;
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

  public static getInstance(): StandBookingQuestionOption {
    return (
      StandBookingQuestionOption.instance || new StandBookingQuestionOption()
    );
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
          this.id = response.data?.id ?? this.id;
          return res();
        })
        .catch((error) => rej(error));
    });
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
