const GetBooleanFromString = (value: string): boolean => {
  if (!value || value === '') return false;
  if (value.toLocaleLowerCase() === 'true') return true;
  return false;
};

export default GetBooleanFromString;
