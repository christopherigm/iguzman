import { Signal, signal } from '@preact-signals/safe-react';
import { CommonFields, BaseAPIClass, API, RebuildData } from '@repo/utils';
import type { DropDownFieldOption } from '@repo/ui';
import ProductFeature from 'classes/product/product-feature';
import Product from 'classes/product/product';
import User from 'classes/user';

export default class UserFavoriteItem extends BaseAPIClass {
  public static instance: UserFavoriteItem;
  public type = 'UserFavoriteBuyableItem';
  public endpoint = 'v1/user-favorite-items/';
  public attributes: UserFavoriteItemAttributes =
    new UserFavoriteItemAttributes();
  public relationships: UserFavoriteItemRelationships =
    new UserFavoriteItemRelationships();

  public static getInstance(): UserFavoriteItem {
    return UserFavoriteItem.instance || new UserFavoriteItem();
  }

  public getItemsFromAPI(): Promise<Array<UserFavoriteItem>> {
    return new Promise((res, rej) => {
      super
        .getItemsFromAPI()
        .then((data: Array<any>) => {
          const items: Array<UserFavoriteItem> = [];
          data.forEach((i: any) => {
            const newItem = new UserFavoriteItem();
            newItem.setDataFromPlainObject(i);
            items.push(newItem);
          });
          res(items);
        })
        .catch((e: any) => rej(e));
    });
  }

  public checkFavoriteItem(id: number, type: string): boolean {
    let isFavorite: boolean = false;
    const user = new User();
    user.setDataFromLocalStorage();
    if (type === 'Product') {
      isFavorite =
        user.relationships.favorite_items.data.find((i) => {
          return i.relationships.product.data.id === id;
        }) !== undefined;
    }
    return isFavorite;
  }

  public setFavoriteItem(
    id: number,
    type: string,
    isFavorite: boolean
  ): Promise<any> {
    const user = new User();
    user.setDataFromLocalStorage();
    const userFavoriteItem = user.relationships.favorite_items.data.find(
      (i) => {
        return i.relationships.product.data.id === id;
      }
    );
    if (userFavoriteItem) {
      this.setDataFromPlainObject(userFavoriteItem);
    }
    this.relationships.user.data.id = user.id;
    if (type === 'Product') {
      this.relationships.product.data.id = id;
    }
    if (isFavorite) {
      return this.delete();
    }
    return this.save();
  }

  public save(): Promise<any> {
    return new Promise((res, rej) => {
      super
        .save()
        .then(() => res(this.updateUser()))
        .catch((e) => rej(e));
    });
  }

  public delete(): Promise<any> {
    return new Promise((res, rej) => {
      super
        .delete()
        .then(() => {
          this.id = 0;
          res(this.updateUser());
        })
        .catch((e) => rej(e));
    });
  }

  public updateUser(): Promise<void> {
    return new Promise((res, rej) => {
      if (!this.relationships.user.data.id) {
        return rej('no-parent-id');
      }
      const user = new User();
      user.setDataFromLocalStorage();
      if (this.id) {
        user.relationships.addFavoriteItemFromPlainObject(
          this.getPlainObject()
        );
        user
          .save()
          .then(() => {
            user.setURLParametersForWholeObject();
            user
              .setItemByIDFromAPI()
              .then(() => {
                user.saveLocalStorage();
                res();
              })
              .catch((e) => rej(e));
          })
          .catch((e) => rej(e));
      } else {
        user.setURLParametersForWholeObject();
        user
          .setItemByIDFromAPI()
          .then(() => {
            user.saveLocalStorage();
            res();
          })
          .catch((e) => rej(e));
      }
    });
  }
}

class UserFavoriteItemAttributes extends CommonFields {
  private _backup_name: Signal<string> = signal('');
  private _backup_user_name: Signal<string> = signal('');
  private _backup_final_price: Signal<number> = signal(0);

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.backup_name = object.attributes.backup_name ?? this.backup_name;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.backup_name && {
        backup_name: this.backup_name,
      }),
      ...(this.backup_user_name && {
        backup_user_name: this.backup_user_name,
      }),
      backup_final_price: this.backup_final_price,
    };
  }

  public get backup_name() {
    return this._backup_name.value;
  }
  public set backup_name(value) {
    this._backup_name.value = value;
  }

  public get backup_user_name() {
    return this._backup_user_name.value;
  }
  public set backup_user_name(value) {
    this._backup_user_name.value = value;
  }

  public get backup_final_price() {
    return this._backup_final_price.value;
  }
  public set backup_final_price(value) {
    this._backup_final_price.value = value;
  }
}

class UserFavoriteItemRelationships {
  public _user: Signal<{
    data: {
      id: number;
      type: 'User';
    };
  }> = signal({
    data: {
      id: 0,
      type: 'User',
    },
  });
  public _product: Signal<{ data: Product }> = signal({
    data: new Product(),
  });
  // public _service: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });
  // public _meal: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });
  // public _real_estate: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });
  // public _vehicle: Signal<{ data: Stand }> = signal({
  //   data: new Stand(),
  // });

  public setRelationshipsFromPlainObject(object: any): any {
    // console.log('>>favorite item setRelationshipsFromPlainObject:', object);
    if (object.relationships) {
      if (object.relationships.user?.data) {
        this.user.data.id = object.relationships.user.data.id;
      }
      if (object.relationships.product?.data) {
        this.product.data.setDataFromPlainObject(
          object.relationships.product.data
        );
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.user.data.id && {
        user: {
          data: this.user.data,
        },
      }),
      ...(this.product.data.id && {
        product: {
          data: this.product.data.getPlainObject(),
        },
      }),
    };
  }

  public get user() {
    return this._user.value;
  }
  public set user(value) {
    this._user.value = value;
  }

  public get product() {
    return this._product.value;
  }
  public set product(value) {
    this._product.value = value;
  }
}

export const userFavoriteItem = signal<UserFavoriteItem>(
  UserFavoriteItem.getInstance()
).value;
