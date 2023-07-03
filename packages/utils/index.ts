export {default as GetDatesDifference} from './lib/get-dates-difference';
export type {
  Languages,
  EnvironmentVariables,
  CachedValues,
  System,
  setSystem
} from './interfaces/system-interface';
export type {
  Action,
  Dispatch
} from './interfaces/reducer-interface';
export type {
  BaseUser,
  BaseUserAttributes
} from './interfaces/user-interface';
export {default as SaveCookie} from './lib/cookie-handler';
export {
  GetCachedValue,
  DeleteCookie
} from './lib/cookie-handler';
export {default as GetUserFromCookie} from './lib/get-user-from-cookie';
export {default as GetBrowserCachedValues} from './lib/get-browser-cached-values';
export {default as GetCookieCachedValues} from './lib/get-cookie-cached-values';
export {default as GetEnvVariables} from './lib/get-env-variables';
export {default as ReplaceURLBase} from './lib/replace-url-base';
export {APICreationErrorHandler} from './lib/api-error-handler';
export type {APIPostCreationError} from './lib/api-error-handler';

/**
 * API
 */
export {
  Get,
  Post
} from './api/communicator';
export {default as API} from './api';
export type {JWTPayload} from './interfaces/jwt-interface';

export type {
  LoginCallback,
  VoidCallback
} from './interfaces/function-interfaces';
export {default as RebuildData} from './lib/json-api-rebuild';
export {
  DateParser,
  HourParser,
  ShortDateParser,
  HourParser12Format
} from './lib/date-parser';
export {default as FormatNum} from './lib/format-number';
export {
  GetLocalStorageData,
  SetLocalStorageData,
} from './lib/local-storage';

/**
 * Reducers
 */
export {default as CommonLoginReducer} from './reducers/common-login-reducer';
export {CommonLoginInitialState} from './reducers/common-login-reducer';
export type {
  CommonLoginState
} from './reducers/common-login-reducer';
