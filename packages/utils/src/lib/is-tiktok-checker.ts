const isTiktok = (url: string): boolean => {
  return (
    url.search('https://tiktok.com') > -1 ||
    url.search('https://www.tiktok.com') > -1 ||
    url.search('https://vm.tiktok.com') > -1
  );
};

export default isTiktok;
