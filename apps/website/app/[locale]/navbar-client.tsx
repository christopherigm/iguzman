"use client";

import { useTranslations } from "next-intl";
import { Navbar } from "@repo/ui/core-elements/navbar";
import { useSession } from "@repo/auth/session-provider";
import { useAuthActions } from "@repo/auth/use-auth-actions";
import { useGuestState } from "@/hooks/use-guest-cart";
import { guestCartCount } from "@/lib/guest-cart";
import {
  MENU_ALL_PATH,
  MENU_ITEM_KINDS,
  MENU_KIND_PATHS,
  type MenuItemKind,
} from "@/lib/menu-kinds";
import { kindLabel, type KindLabels } from "@/lib/kind-labels";

interface NavbarClientProps {
  logo: string;
  version: string;
  productCount: number;
  serviceCount: number;
  /**
   * Enabled menu items per `kind`. Drives the whole Menu entry: a kind with no
   * items gets no link, and a tenant with no menu at all gets nothing.
   */
  menuKindCounts: Record<MenuItemKind, number>;
  /**
   * What the tenant calls each kind it sells, already resolved for the rendered
   * locale (`getKindLabels`). A kind the tenant has not renamed is absent and
   * keeps this app's own translation - so an un-renamed site's bar is unchanged.
   */
  kindLabels: KindLabels;
  /**
   * Whether to show the Contact link: true when the tenant has a contact email
   * or at least one branch, i.e. when the public contact page has something to
   * show. Resolved server-side from the System payload.
   */
  showContact: boolean;
  /**
   * Number of enabled events, past ones included. Decides whether the Events
   * link is rendered - a tenant that has never held one gets no link, and one
   * whose last event has been and gone keeps theirs, because `/events` and every
   * shared event link still resolve.
   */
  eventCount: number;
  /**
   * Total quantity in the signed-in user's cart; 0 when logged out - a guest's
   * cart is in their browser, so it is counted here rather than on the server.
   */
  cartCount: number;
}

export function NavbarClient({
  logo,
  version,
  productCount,
  serviceCount,
  menuKindCounts,
  kindLabels,
  showContact,
  eventCount,
  cartCount,
}: NavbarClientProps) {
  const t = useTranslations("Navbar");
  const kindT = useTranslations("MenuKinds");
  // Comes from the server via SessionProvider, decoded from the access-token
  // cookie - so the admin link and the account menu are already right in the
  // first HTML instead of popping in after hydration.
  const session = useSession();
  const { signOut } = useAuthActions();
  const guest = useGuestState();

  const isLoggedIn = session !== null;
  const isAdmin = session?.isAdmin === true;

  // A signed-in count is server-rendered and correct in the first HTML; a
  // guest's can only be known once localStorage is readable, so it appears just
  // after hydration.
  const count = isLoggedIn ? cartCount : guestCartCount(guest);

  const handleSignOut = () => void signOut("/");

  // Favorites and the cart are shown to everyone: a guest has both, kept in
  // their browser and merged into their account when they sign in. They live in
  // `fixedItems` rather than `items` so they stay reachable at every width -
  // they are actions on the current visit, not places to navigate to, and a
  // customer mid-purchase should never have to open the drawer to find them.
  const favoritesItem = {
    label: "",
    href: "/favorites",
    icon: "/icons/favorite.svg",
    ariaLabel: t("favorites"),
  };

  const cartItem = {
    label: "",
    href: "/cart",
    icon: "/icons/add-to-cart.svg",
    ariaLabel: t("cart"),
    // 0 renders no badge at all, so an empty cart is just the icon.
    badge: count,
  };

  const authItem = isLoggedIn
    ? {
        label: "",
        icon: "/icons/user.svg",
        ariaLabel: t("myAccount"),
        children: [
          { label: t("myAccount"), href: "/account" },
          // Order history lives here rather than in the top-level bar: it is a
          // thing you go looking for, not one you navigate by.
          { label: t("orders"), href: "/orders" },
          { label: t("signOut"), onClick: handleSignOut },
        ],
      }
    : {
        label: "",
        href: "/auth",
        icon: "/icons/user.svg",
        ariaLabel: t("accessAccount"),
      };

  // The menu is one entry with a dropdown, not one top-level link per kind: a
  // restaurant carrying dishes, drinks, desserts and sides would otherwise push
  // Orders and Contact into the hamburger on a laptop. Only kinds the tenant
  // actually has are offered, so a taquería with no dessert never shows an
  // empty Desserts page.
  const stockedKinds = MENU_ITEM_KINDS.filter(
    (kind) => (menuKindCounts[kind] ?? 0) > 0,
  );
  // The tenant's own name for each kind wins over ours ("Pizzas", not "Food");
  // the href is untouched, since a label rename must never move a page.
  const kindItems = stockedKinds.map((kind) => ({
    label: kindLabel(kindLabels, kind, kindT(kind)),
    href: MENU_KIND_PATHS[kind],
  }));
  // With a single kind there is nothing to choose between: the dropdown would
  // hold "Full menu" and one link to the same items, so it collapses to a plain
  // link straight to that kind's page.
  const menuItems =
    stockedKinds.length === 0
      ? []
      : stockedKinds.length === 1
        ? kindItems
        : [
            {
              label: kindT("menu"),
              // A parent with children renders as a button, but the shared
              // Navbar still reads `href` to decide the active underline - and
              // it also marks a parent active when any child is, so this is
              // only what the "Full menu" page itself matches.
              href: MENU_ALL_PATH,
              children: [
                { label: kindT("all"), href: MENU_ALL_PATH },
                ...kindItems,
              ],
            },
          ];

  // Every applicable item stays in the bar on every page - including Home and
  // the current page. The shared Navbar marks the active item with a bottom
  // border (via usePathname), so we no longer hide the page you are on.
  const navItems = [
    { label: t("home"), href: "/" },
    ...(productCount > 0
      ? [
          {
            label: kindLabel(kindLabels, "product", t("products")),
            href: "/categories/products",
          },
        ]
      : []),
    ...(serviceCount > 0
      ? [
          {
            label: kindLabel(kindLabels, "service", t("services")),
            href: "/categories/services",
          },
        ]
      : []),
    ...menuItems,
    // After the catalog and before Orders: events are something to browse, like
    // the catalog above them, rather than an account surface.
    ...(eventCount > 0 ? [{ label: t("events"), href: "/events" }] : []),
    // Order history stays signed-in only - a guest reaches their order by its
    // link, and there is no list of "their" orders to show. (Favorites and the
    // cart are in `fixedItems` below.)
    ...(isLoggedIn ? [{ label: t("orders"), href: "/orders" }] : []),
    ...(showContact ? [{ label: t("contact"), href: "/contact" }] : []),
    // Admin-only, exactly like the CMS link. Both only drive what is rendered -
    // `/pos` is in `proxy.ts`'s protected prefixes, the page re-checks `isAdmin`,
    // and Django re-derives it from the token on every call.
    ...(isAdmin ? [{ label: t("pos"), href: "/pos" }] : []),
    ...(isAdmin ? [{ label: t("admin"), href: "/admin" }] : []),
  ];

  return (
    <Navbar
      logo={logo}
      items={navItems}
      fixedItems={[favoritesItem, cartItem, authItem]}
      version={version}
      translucent
    />
  );
}
