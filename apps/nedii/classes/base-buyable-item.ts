import { Signal, signal } from '@preact-signals/safe-react';
import { API, BasePicture, BasePictureAttributes } from '@repo/utils';
import StandAttributes from 'classes/stand/stand-attributes';

export default abstract class BaseBuyableItem extends BasePicture {
  public relationships: BaseBuyableItemRelationships =
    new BaseBuyableItemRelationships();
  public attributes: BaseBuyableItemAttributes =
    new BaseBuyableItemAttributes();
  private _userID: Signal<number> = signal(0);
  private _userName: Signal<string> = signal('none');
  private _isFavorite: Signal<boolean> = signal(false);
  private _isInCart: Signal<boolean> = signal(false);

  public switchFavorite = (): Promise<void> => {
    return new Promise((res, rej) => {
      const url = `${this.URLBase}/v1/user-cart-items/`;
      const data = {
        url,
        jwt: this.access,
        data: {
          type: 'UserCartBuyableItem',
          attributes: {
            backup_name: this.attributes.name,
            backup_user_name: this.userName || 'none',
            backup_final_price: this.attributes.final_price,
            quantity: 1,
          },
          relationships: {
            product: {
              data: {
                type: this.type,
                id: this.id,
              },
            },
            service: {
              data: null,
            },
            meal: {
              data: null,
            },
            vehicle: {
              data: null,
            },
            real_estate: {
              data: null,
            },
          },
        },
      };
      API.Post(data)
        .then((response) => {
          console.log('response', response);
          if (response.errors && response.errors.length) {
            // return rej(response.errors);
          } else {
            // this.id = Number(response.data?.id ?? this.id);
            this.isFavorite = !this.isFavorite;
            return res();
          }
        })
        .catch((error) => rej(error));
    });
  };

  public switchIsInCart = (): void => {
    this.isInCart = !this.isInCart;
  };

  public get userID() {
    return this._userID.value;
  }
  public set userID(value) {
    this._userID.value = value;
  }

  public get userName() {
    return this._userName.value;
  }
  public set userName(value) {
    this._userName.value = value;
  }

  public get isFavorite() {
    return this._isFavorite.value;
  }
  public set isFavorite(value) {
    this._isFavorite.value = value;
  }

  public get isInCart() {
    return this._isInCart.value;
  }
  public set isInCart(value) {
    this._isInCart.value = value;
  }
}

export class BaseBuyableItemAttributes extends BasePictureAttributes {
  private _publish_on_the_wall: Signal<boolean> = signal(false);
  private _short_description: Signal<string> = signal('');
  private _stock: Signal<number> = signal(0);
  private _unlimited_stock: Signal<boolean> = signal(false);
  private _price: Signal<number> = signal(0);
  private _discount: Signal<number> = signal(0);
  private _final_price: Signal<number> = signal(0);
  private _shipping_cost: Signal<number> = signal(0);
  private _video_link: Signal<string> = signal('');
  private _support_email: Signal<string> = signal('');
  private _support_info: Signal<string> = signal('');
  private _support_phone: Signal<string> = signal('');
  private _warranty_days: Signal<number> = signal(0);
  private _times_selled: Signal<number> = signal(0);
  private _views: Signal<number> = signal(0);

  public setAttributesFromPlainObject(object: any) {
    if (object.attributes) {
      super.setAttributesFromPlainObject(object);
      this.publish_on_the_wall =
        object.attributes.publish_on_the_wall ?? this.publish_on_the_wall;
      this.short_description =
        object.attributes.short_description ?? this.short_description;
      this.stock = object.attributes.stock ?? this.stock;
      this.unlimited_stock =
        object.attributes.unlimited_stock ?? this.unlimited_stock;
      this.price = object.attributes.price ?? this.price;
      this.discount = object.attributes.discount ?? this.discount;
      this.final_price = object.attributes.final_price ?? this.final_price;
      this.shipping_cost =
        object.attributes.shipping_cost ?? this.shipping_cost;
      this.video_link = object.attributes.video_link ?? this.video_link;
      this.support_email =
        object.attributes.support_email ?? this.support_email;
      this.support_info = object.attributes.support_info ?? this.support_info;
      this.support_phone =
        object.attributes.support_phone ?? this.support_phone;
      this.warranty_days =
        object.attributes.warranty_days ?? this.warranty_days;
      this.times_selled = object.attributes.times_selled ?? this.times_selled;
      this.views = object.attributes.views ?? this.views;
    }
  }

  public getPlainAttributes(): any {
    return {
      ...super.getPlainAttributes(),
      ...(this.short_description && {
        short_description: this.short_description,
      }),
      ...(this.stock && {
        stock: this.stock,
      }),
      ...(this.unlimited_stock && {
        unlimited_stock: this.unlimited_stock,
      }),
      price: this.price,
      discount: this.discount,
      final_price: this.final_price,
      shipping_cost: this.shipping_cost,
      ...(this.video_link && {
        video_link: this.video_link,
      }),
      ...(this.support_email && {
        support_email: this.support_email,
      }),
      ...(this.support_info && {
        support_info: this.support_info,
      }),
      ...(this.support_phone && {
        support_phone: this.support_phone,
      }),
      warranty_days: this.warranty_days,
      times_selled: this.times_selled,
      ...(this.views && {
        views: this.views,
      }),
      publish_on_the_wall: this.publish_on_the_wall,
    };
  }

  public get publish_on_the_wall() {
    return this._publish_on_the_wall.value;
  }
  public set publish_on_the_wall(value) {
    this._publish_on_the_wall.value = value;
  }

  public get short_description() {
    return this._short_description.value;
  }
  public set short_description(value) {
    this._short_description.value = value;
  }

  public get stock() {
    return this._stock.value;
  }
  public set stock(value) {
    this._stock.value = value;
  }

  public get unlimited_stock() {
    return this._unlimited_stock.value;
  }
  public set unlimited_stock(value) {
    this._unlimited_stock.value = value;
  }

  public get price() {
    return this._price.value;
  }
  public set price(value) {
    this._price.value = value;
  }

  public get discount() {
    return this._discount.value;
  }
  public set discount(value) {
    this._discount.value = value;
  }

  public get final_price() {
    return this._final_price.value;
  }
  public set final_price(value) {
    this._final_price.value = value;
  }

  public get shipping_cost() {
    return this._shipping_cost.value;
  }
  public set shipping_cost(value) {
    this._shipping_cost.value = value;
  }

  public get video_link() {
    return this._video_link.value;
  }
  public set video_link(value) {
    this._video_link.value = value;
  }

  public get support_email() {
    return this._support_email.value;
  }
  public set support_email(value) {
    this._support_email.value = value;
  }

  public get support_info() {
    return this._support_info.value;
  }
  public set support_info(value) {
    this._support_info.value = value;
  }

  public get support_phone() {
    return this._support_phone.value;
  }
  public set support_phone(value) {
    this._support_phone.value = value;
  }

  public get warranty_days() {
    return this._warranty_days.value;
  }
  public set warranty_days(value) {
    this._warranty_days.value = value;
  }

  public get times_selled() {
    return this._times_selled.value;
  }
  public set times_selled(value) {
    this._times_selled.value = value;
  }

  public get views() {
    return this._views.value;
  }
  public set views(value) {
    this._views.value = value;
  }
}

export class BaseBuyableItemRelationships {
  public _stand: Signal<{
    data: {
      id: number;
      type: 'Stand';
      attributes: StandAttributes;
    };
  }> = signal({
    data: {
      id: 0,
      type: 'Stand',
      attributes: new StandAttributes(),
    },
  });

  public setRelationshipsFromPlainObject(object: any): any {
    if (object.relationships) {
      if (object.relationships.stand?.data) {
        this.stand.data.id = object.relationships.stand.data.id;
        this.stand.data.attributes.setAttributesFromPlainObject(
          object.relationships.stand.data
        );
      }
    }
  }

  public getPlainRelationships(): any {
    return {
      ...(this.stand.data.id && {
        stand: {
          data: this.stand.data,
        },
      }),
    };
  }

  public get stand() {
    return this._stand.value;
  }
  public set stand(value) {
    this._stand.value = value;
  }
}
