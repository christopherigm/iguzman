export type SortOrder = 'asc' | 'desc';

/**
 * Creates a comparator function that sorts an array of objects by a given property.
 *
 * Intended to be passed to `Array.prototype.sort()`. Objects missing the
 * specified property are treated as equal (sort position unchanged).
 *
 * @param key   - The property name to sort by
 * @param order - Sort direction: `'asc'` (default) or `'desc'`
 * @returns A comparator function compatible with `Array.prototype.sort()`
 *
 * @example
 * ```ts
 * const users = [{ name: 'Zoe' }, { name: 'Ana' }];
 * users.sort(sortByProperty('name'));        // [{ name: 'Ana' }, { name: 'Zoe' }]
 * users.sort(sortByProperty('name', 'desc')); // [{ name: 'Zoe' }, { name: 'Ana' }]
 * ```
 */
const sortByProperty = <T extends Record<string, unknown>>(
  key: keyof T & string,
  order: SortOrder = 'asc',
) => {
  return (a: T, b: T): number => {
    if (!(key in a) || !(key in b)) return 0;

    const valA = a[key];
    const valB = b[key];

    if (valA > valB) return order === 'desc' ? -1 : 1;
    if (valA < valB) return order === 'desc' ? 1 : -1;
    return 0;
  };
};

export default sortByProperty;
