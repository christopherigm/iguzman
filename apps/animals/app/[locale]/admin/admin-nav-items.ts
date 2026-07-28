/**
 * The CMS menu, in the order an author works down it.
 *
 * Read twice: the sidebar renders it as a list, and `/admin` renders the same
 * entries as a card grid - which is why each carries a `descKey` the sidebar
 * ignores. Both look their labels up in the `Admin` namespace, so an entry added
 * here needs its two keys in all five `messages/*.json`.
 *
 * The ordering is the site's own shape rather than alphabetical: settings and
 * branding first (they are set once), then the catalog from the outside in
 * (a category holds species, a species holds sightings), then the journal
 * entries that reference all of it, then the people who may edit it.
 */
export const ADMIN_NAV_ITEMS = [
  { key: 'system', href: '/admin/system', icon: '⚙️', descKey: 'systemDesc' },
  {
    key: 'logosAndStyles',
    href: '/admin/logos-and-styles',
    icon: '🎨',
    descKey: 'logosAndStylesDesc',
  },
  { key: 'categories', href: '/admin/categories', icon: '🏷️', descKey: 'categoriesDesc' },
  { key: 'species', href: '/admin/species', icon: '🦌', descKey: 'speciesDesc' },
  { key: 'sightings', href: '/admin/sightings', icon: '📔', descKey: 'sightingsDesc' },
  { key: 'locations', href: '/admin/locations', icon: '📍', descKey: 'locationsDesc' },
  { key: 'seasons', href: '/admin/seasons', icon: '🍂', descKey: 'seasonsDesc' },
  { key: 'weather', href: '/admin/weather', icon: '🌦️', descKey: 'weatherDesc' },
  { key: 'users', href: '/admin/users', icon: '👥', descKey: 'usersDesc' },
] as const;
