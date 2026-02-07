// eslint-disable-next-line @typescript-eslint/no-require-imports
const wNumb = require('wnumb');

const defaultOptions = {
  mark: '.',
  thousand: ',',
  prefix: '$',
  decimals: 2,
};

type Options = typeof defaultOptions;

const GetMoneyFormat = (
  value: string | number,
  options: Options = defaultOptions,
): string => {
  const moneyFormat = wNumb(options);
  return moneyFormat.to(Number(value));
};

export default GetMoneyFormat;
