export { default as GetDatesDifference } from './lib/get-dates-difference';
export type {
  Languages,
  EnvironmentVariables,
  CachedValues,
  System,
  setSystem,
} from './interfaces/system-interface';
export type {
  CountryInterface,
  StateInterface,
  CityInterface,
  BasePictureAttributesInterface,
  JSONAPICommonArrayResponse,
} from './interfaces/common-interfaces';
export type { Action, Dispatch } from './interfaces/reducer-interface';
export type { UserAddressAttributesInterface } from './interfaces/user-address-attributes-interface';
export type { JWTPayload } from './interfaces/jwt-interface';
export type {
  APIPostCreationError,
  CreationErrorInput,
} from './interfaces/api-error-handler';
export type {
  LoginCallback,
  VoidCallback,
} from './interfaces/function-interfaces';

export { default as SaveCookie } from './lib/cookie-handler';
export { GetCachedValue, DeleteCookie } from './lib/cookie-handler';
export { default as GetUserFromCookie } from './lib/get-user-from-cookie';
export { default as GetBrowserCachedValues } from './lib/get-browser-cached-values';
export { default as GetCookieCachedValues } from './lib/get-cookie-cached-values';
export { default as GetEnvVariables } from './lib/get-env-variables';
export { default as ReplaceURLBase } from './lib/replace-url-base';
// export { APICreationErrorHandler } from './lib/api-error-handler';
export { default as GetBooleanFromString } from './lib/get-boolean-from-string';
export { default as isYoutube } from './lib/is-youtube-checker';
export { default as isTwitter } from './lib/is-twitter-checker';
export { default as isFacebook } from './lib/is-facebook-checker';
export { default as isInstagram } from './lib/is-instagram-checker';
export { default as isTiktok } from './lib/is-tiktok-checker';
export { default as isX } from './lib/is-x-checker';
export { default as InnerSort } from './lib/inner-sort';
export { default as isPinterest } from './lib/is-pinterest-checker';
export type { InnerSortOrderTypes } from './lib/inner-sort';

/**
 * API
 */
export { Get, Post, Patch, Delete } from './api/communicator';
export { default as API } from './api';

export { default as RebuildData } from './lib/json-api-rebuild';
export {
  DateParser,
  ShortDateParser,
  SubstractDates,
  DateRangeComposer,
  HourParser,
  HourParser12Format,
} from './lib/date-parser';
export { default as FormatNum } from './lib/format-number';
export { GetLocalStorageData, SetLocalStorageData } from './lib/local-storage';

/**
 * Classes
 */
export { default as BaseClass } from './classes/base-class';
export { default as CommonFields } from './classes/common-fields';
export { default as TimeFields } from './classes/time-fields';
export { default as WeekSchedule } from './classes/week-schedule';
export { default as WebLinks } from './classes/web-links-common';
export { BaseUser, BaseUserAttributes } from './classes/base-user';
export { default as Country } from './classes/country';
export { default as State } from './classes/state';
export { default as City } from './classes/city';
export { BasePicture, BasePictureAttributes } from './classes/base-picture';
export { BaseSystem } from './classes/base-system';
export { BaseUserAddress } from './classes/base-user-address';
