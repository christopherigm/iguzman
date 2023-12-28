const isTwitter = (url: string): boolean => {
  return (
    url.search('https://twitter.com') > -1 ||
    url.search('https://www.twitter.com') > -1 ||
    url.search('https://x.com') > -1 ||
    url.search('https://www.x.com') > -1
  );
};

export default isTwitter;
