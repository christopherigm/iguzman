const isInstagram = (url: string): boolean => {
  return (
    url.search('https://instagram.com') > -1 ||
    url.search('https://www.instagram.com') > -1 ||
    url.search('https://ig.com') > -1 ||
    url.search('https://www.ig.com') > -1
  );
};

export default isInstagram;
