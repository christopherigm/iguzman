const isX = (url: string): boolean => {
  return (
    url.search('https://x.com') > -1 || url.search('https://www.x.com') > -1
  );
};

export default isX;
