export const ADMIN_NAV_ITEMS = [
  { key: "system", href: "/admin/system", icon: "⚙️", descKey: "systemDesc" },
  // Not under /admin: the till is its own full-screen route with no CMS chrome.
  // Listed here anyway because this menu is where an admin looks for their tools.
  { key: "pos", href: "/pos", icon: "🧾", descKey: "posDesc" },
  { key: "orders", href: "/admin/orders", icon: "📋", descKey: "ordersDesc" },
  {
    key: "messages",
    href: "/admin/messages",
    icon: "✉️",
    descKey: "messagesDesc",
  },
  {
    key: "branches",
    href: "/admin/branches",
    icon: "📍",
    descKey: "branchesDesc",
  },
  { key: "users", href: "/admin/users", icon: "👥", descKey: "usersDesc" },
  { key: "brands", href: "/admin/brands", icon: "🎯", descKey: "brandsDesc" },
  {
    key: "productCategories",
    href: "/admin/product-categories",
    icon: "🏷️",
    descKey: "productCategoriesDesc",
  },
  {
    key: "products",
    href: "/admin/products",
    icon: "📦",
    descKey: "productsDesc",
  },
  {
    key: "serviceCategories",
    href: "/admin/service-categories",
    icon: "🏷️",
    descKey: "serviceCategoriesDesc",
  },
  {
    key: "services",
    href: "/admin/services",
    icon: "🛠️",
    descKey: "servicesDesc",
  },
  {
    key: "menuCategories",
    href: "/admin/menu-categories",
    icon: "🏷️",
    descKey: "menuCategoriesDesc",
  },
  {
    key: "ingredients",
    href: "/admin/ingredients",
    icon: "🥕",
    descKey: "ingredientsDesc",
  },
  {
    key: "menuItems",
    href: "/admin/menu-items",
    icon: "🍽️",
    descKey: "menuItemsDesc",
  },
  {
    key: "socialPosts",
    href: "/admin/social-posts",
    icon: "🖼️",
    descKey: "socialPostsDesc",
  },
  {
    key: "successStories",
    href: "/admin/success-stories",
    icon: "⭐",
    descKey: "successStoriesDesc",
  },
  {
    key: "highlights",
    href: "/admin/highlights",
    icon: "✨",
    descKey: "highlightsDesc",
  },
] as const;
