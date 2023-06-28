import {System} from '../interfaces/system-interface';

export const SaveCookie = (
    key: string,
    value: string,
    paths: Array<string> = [],
  ) => {
  const date = new Date();
  const expDays = 30;
  document.cookie = `${key}=;`;
  date.setTime(date.getTime() + (expDays * 24 * 60 * 60 * 1000));
  const expires = `expires=${date.toUTCString()}`;
  if (paths && paths.length) {
    paths.forEach((i: string) => {
      document.cookie = `${key}=${JSON.stringify(value)};${expires};path=${i};`;
    });
  } else {
    document.cookie = `${key}=${JSON.stringify(value)};${expires};path=/;`;
  }
  document.cookie = `${key}=${JSON.stringify(value)};${expires};path=*;`;
};

type Cookie = {
  system: string;
}

type Props = {
  cookies: Cookie;
}

export const ParseSystemCookie = (req: Props): System => {
  const cookies = req.cookies;
  const system = JSON.parse(cookies.system) as System;
  return system;
};

export const GetCachedValue = (cname: string): string | boolean => {
  let name = cname + "=";
  let decodedCookie = decodeURIComponent(document.cookie);
  let ca = decodedCookie.split(';');
  for(let i = 0; i <ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) == ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) == 0) {
      let value = c.substring(name.length + 1, c.length - 1);
      if ( value === 'true' ) return true;
      if ( value === 'false' ) return false;
      return value;
    }
  }
  return '';
};

export const DeleteCookie = (key: string): void => {
  document.cookie = `${key}=;`;
};

export default SaveCookie;
