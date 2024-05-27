const removeImagesForAPICall = (object: any) => {
  for (const i in object) {
    if (
      Object.prototype.hasOwnProperty.call(object, i) &&
      i.search('img') > -1 &&
      String(object[i]).search('base64') < 0
    ) {
      delete object[i];
    }
  }
};

export default removeImagesForAPICall;
