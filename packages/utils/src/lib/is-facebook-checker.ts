const isFacebook = (url: string): boolean => {
  return (
    url.search('https://facebook.com') > -1 ||
    url.search('https://www.facebook.com') > -1 ||
    url.search('https://fb.com') > -1 ||
    url.search('https://www.fb.com') > -1 ||
    url.search('https://fb.watch') > -1
  );
};

export default isFacebook;
