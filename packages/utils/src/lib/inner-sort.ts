export type InnerSortOrderTypes = 'asc' | 'desc';

const InnerSort = (key: string, order: InnerSortOrderTypes = 'asc') => {
  return function innerSort(a: any, b: any): number {
    if (!a.hasOwnProperty(key) || !b.hasOwnProperty(key)) {
      return 0;
    }
    const varA = a[key];
    const varB = b[key];
    let comparison = 0;
    if (varA > varB) {
      comparison = 1;
    } else if (varA < varB) {
      comparison = -1;
    }
    return order === 'desc' ? comparison * -1 : comparison;
  };
};

export default InnerSort;
