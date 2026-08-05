export const ADMIN_NAV_ITEMS = [
  { key: "system", href: "/admin/system", icon: "⚙️", descKey: "systemDesc" },
  {
    key: "logosAndStyles",
    href: "/admin/logos-and-styles",
    icon: "🎨",
    descKey: "logosAndStylesDesc",
  },
  {
    key: "messages",
    href: "/admin/messages",
    icon: "✉️",
    descKey: "messagesDesc",
  },
  { key: "orders", href: "/admin/orders", icon: "📋", descKey: "ordersDesc" },
  // Beside orders rather than beside branches: a booking is an order the tenant
  // has to turn up for, and it is read on the same rhythm as the order list.
  {
    key: "bookings",
    href: "/admin/bookings",
    icon: "📅",
    descKey: "bookingsDesc",
  },
  {
    // `spotlightTitle` is the section's existing label ("Featured Spotlight"),
    // reused here rather than translated a second time under a nav-only key.
    key: "spotlightTitle",
    href: "/admin/featured-spotlight",
    icon: "🌟",
    descKey: "spotlightPageDesc",
  },
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
    key: "events",
    href: "/admin/events",
    icon: "🎪",
    descKey: "eventsDesc",
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
  { key: "brands", href: "/admin/brands", icon: "🎯", descKey: "brandsDesc" },
  // Not under /admin: the till is its own full-screen route with no CMS chrome.
  // Listed here anyway because this menu is where an admin looks for their tools.
  { key: "pos", href: "/pos", icon: "🧾", descKey: "posDesc" },
  {
    // `paymentsTitle` is the section's existing label ("Payments"), reused here
    // rather than translated a second time under a nav-only key.
    key: "paymentsTitle",
    href: "/admin/payments",
    icon: "💳",
    descKey: "paymentsPageDesc",
  },
  {
    key: "branches",
    href: "/admin/branches",
    icon: "📍",
    descKey: "branchesDesc",
  },
  { key: "users", href: "/admin/users", icon: "👥", descKey: "usersDesc" },
  {
    key: "aboutPage",
    href: "/admin/about",
    icon: "📖",
    descKey: "aboutPageDesc",
  },
] as const;
