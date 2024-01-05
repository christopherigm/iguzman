const FormatNum = (num: number, round = true): string => {
  return new Intl.NumberFormat().format(round ? Math.round(num) : num);
};

export default FormatNum;
