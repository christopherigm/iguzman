import { Signal, signal } from '@preact-signals/safe-react';
import { API, BasePicture, BasePictureAttributes } from '@repo/utils';

export default class Category extends BasePicture {
  public static instance: Category;
  public type: string = 'Category';
  public endpoint: string = 'v1/categories/';
  public attributes: CategoryAttributes = new CategoryAttributes();
  public relationships = null;
  private _selected: Signal<boolean> = signal(false);

  public static getInstance(): Category {
    return Category.instance || new Category();
  }

  public getCategories(): Promise<Array<Category>> {
    return new Promise((res, rej) => {
      if (!this.URLBase) {
        return rej('No URLBase');
      }
      const url = `${this.URLBase}/${this.endpoint}`;
      API.Get({ url })
        .then((response) => {
          const categories: Array<Category> = [];
          response.data.map((rawCategory: any) => {
            const newCategory = new Category();
            newCategory.setDataFromPlainObject(rawCategory);
            categories.push(newCategory);
          });
          res(categories);
        })
        .catch((e) => rej(e));
    });
  }

  public get selected() {
    return this._selected.value;
  }
  public set selected(value) {
    this._selected.value = value;
  }
}

class CategoryAttributes extends BasePictureAttributes {
  private _slug: Signal<string> = signal('');
  private _icon: Signal<string> = signal('');
  private _color: Signal<string> = signal('');

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.slug = object.attributes.slug ?? this.slug;
      this.icon = object.attributes.icon ?? this.icon;
      this.color = object.attributes.color ?? this.color;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.slug && {
        slug: this.slug,
      }),
      ...(this.icon && {
        icon: this.icon,
      }),
      ...(this.color && {
        color: this.color,
      }),
    };
  }

  public get slug() {
    return this._slug.value;
  }
  public set slug(value) {
    this._slug.value = value;
  }

  public get icon() {
    return this._icon.value;
  }
  public set icon(value) {
    this._icon.value = value;
  }

  public get color() {
    return this._color.value;
  }
  public set color(value) {
    this._color.value = value;
  }
}

export const category = signal<Category>(Category.getInstance()).value;
