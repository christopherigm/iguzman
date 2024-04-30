const isPinterest = (url: string): boolean => {
  return url.search('https://pin.it') > -1;
};

export default isPinterest;
