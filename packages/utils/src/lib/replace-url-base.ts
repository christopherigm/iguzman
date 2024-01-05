const fixObject = (item: any, URLBase: string, newURLBase: string): any => {
  for (const i in item) {
    if (typeof item[i] === 'object') {
      fixObject(item[i], URLBase, newURLBase);
    } else if (i === 'img_picture') {
      item[i] = item[i].replace(URLBase, newURLBase);
    }
  }
  return item;
};

const ReplaceURLBase = (d: any, URLBase: string, newURLBase: string) => {
  let data: any = JSON.parse(JSON.stringify(d));
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      data[i] = fixObject(data[i], URLBase, newURLBase);
    }
  } else {
    data = fixObject(data, URLBase, newURLBase);
  }
  return data;
};

export default ReplaceURLBase;
