export const GetLocalStorageData = (key: string): string | null => {
  try {
    if (localStorage === undefined) return null;
    const data = localStorage.getItem(key);
    if (
      typeof data === 'string' &&
      data !== undefined &&
      data !== 'undefined'
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
};

export const SetLocalStorageData = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    null;
  }
};
