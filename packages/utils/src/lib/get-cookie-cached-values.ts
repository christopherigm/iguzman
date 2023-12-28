import type { CachedValues } from '../interfaces/system-interface';

const getBooleanValue = (value: string): boolean => {
  if (value === 'true') return true;
  return false;
};

const GetCookieCachedValues = (cookies: any): CachedValues => {
  return {
    language: cookies.language || null,
    darkMode: getBooleanValue(cookies.darkMode),
    devMode: getBooleanValue(cookies.devMode),
  };
};

export default GetCookieCachedValues;
