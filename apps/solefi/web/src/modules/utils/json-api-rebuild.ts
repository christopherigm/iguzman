/* eslint-disable max-depth */
const fillIncluded = ( item: any, included: any ): any => {
  if ( !included || !included.length ) return item;
  for (let j = 0; j < included.length; j++) {
    const id = item.id ? item.id : item.data && item.data.id ? item.data.id : null;
    const type = item.type ? item.type : item.data && item.data.type ? item.data.type : null;
    if ( !id || !type ) return item;
    if ( id === included[j].id && type === included[j].type ) {
      if ( item.id ) item = included[j];
      else item.data = included[j];
      break;
    }
  }
  if ( item.relationships ) {
    item = rebuildObject(item, included);
  } else if ( item.data && item.data.relationships ) {
    item.data = rebuildObject(item.data, included);
  }
  return item;
};

const rebuildObject = ( item: any, included: any ): any => {
  if ( item.relationships ) {
    for (const i in item.relationships) {
      if (Object.prototype.hasOwnProperty.call(item.relationships, i)) {
        if ( Array.isArray(item.relationships[i].data) ) {
          for (let j = 0; j < item.relationships[i].data.length; j++) {
            item.relationships[i].data[j] = fillIncluded({ ...item.relationships[i].data[j] }, included);
          }
        } else {
          item.relationships[i] = fillIncluded({ ...item.relationships[i] }, included);
        }
      }
    }
  }
  return item;
};

const rebuildData = ( d: any ): any => {
  const data: any = { ...d };
  const included: any = data.included;
  if ( Array.isArray(data.data) ) {
    for (let i = 0; i < data.data.length; i++) {
      data.data[i] = rebuildObject(data.data[i], included);
    }
  } else {
    data.data = rebuildObject(data.data, included);
  }
  return data;
};

export default rebuildData;
