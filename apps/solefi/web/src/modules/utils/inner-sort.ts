const innerSort = (key: string, order = 'asc') => {
  return function innerSort(a: any, b: any): number {
    if (!a.attributes.hasOwnProperty(key) || !b.attributes.hasOwnProperty(key)) {
      return 0;
    }
    const varA = a.attributes[key];
    const varB = b.attributes[key];
    let comparison = 0;
    if (varA > varB) {
      comparison = 1;
    } else if (varA < varB) {
      comparison = -1;
    }
    return (
      (order === 'desc') ? (comparison * -1) : comparison
    );
  };
};

export default innerSort;
