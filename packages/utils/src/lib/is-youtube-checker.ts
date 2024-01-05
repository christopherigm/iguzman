const isYoutube = (url: string): boolean => {
  return (
    url.search('https://youtube.com') > -1 ||
    url.search('https://www.youtube.com') > -1 ||
    url.search('https://wwww.youtu.be') > -1 ||
    url.search('https://youtu.be') > -1
  );
};

export default isYoutube;
