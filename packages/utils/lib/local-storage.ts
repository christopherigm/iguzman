export const GetLocalStorageData = (key: string): string | null => {
  const data = localStorage.getItem(key);
  if (typeof data === 'string') {
    return data;
  }
  return null;
};

export const SetLocalStorageData = (key: string, value: string): void => {
  localStorage.setItem(key, value);
};
