export const ADMIN_NAV_ITEMS = [
  { key: 'system', href: '/admin/system', icon: '⚙️', descKey: 'systemDesc' },
  { key: 'products', href: '/admin/products', icon: '📦', descKey: 'productsDesc' },
  { key: 'productCategories', href: '/admin/product-categories', icon: '🏷️', descKey: 'productCategoriesDesc' },
  { key: 'services', href: '/admin/services', icon: '🛠️', descKey: 'servicesDesc' },
  { key: 'serviceCategories', href: '/admin/service-categories', icon: '🏷️', descKey: 'serviceCategoriesDesc' },
  { key: 'brands', href: '/admin/brands', icon: '🎯', descKey: 'brandsDesc' },
  { key: 'variantOptions', href: '/admin/variant-options', icon: '🔀', descKey: 'variantOptionsDesc' },
  { key: 'successStories', href: '/admin/success-stories', icon: '⭐', descKey: 'successStoriesDesc' },
  { key: 'highlights', href: '/admin/highlights', icon: '✨', descKey: 'highlightsDesc' },
  { key: 'users', href: '/admin/users', icon: '👥', descKey: 'usersDesc' },
] as const;
