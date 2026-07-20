"use client";

import { useTranslations } from "next-intl";
import { Navbar } from "@repo/ui/core-elements/navbar";
import { useSession } from "@repo/auth/session-provider";
import { useAuthActions } from "@repo/auth/use-auth-actions";
import { useGuestState } from "@/hooks/use-guest-cart";
import { guestCartCount } from "@/lib/guest-cart";

interface NavbarClientProps {
  logo: string;
  version: string;
  productCount: number;
  serviceCount: number;
  /** Number of enabled menu items; drives the Food link, 0 hides it. */
  foodCount: number;
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
  foodCount,
  cartCount,
}: NavbarClientProps) {
  const t = useTranslations("Navbar");
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

  const authItem = isLoggedIn
    ? {
        label: "",
        icon: "/icons/user.svg",
        children: [
          { label: t("myAccount"), href: "/account" },
          // Order history lives here rather than in the top-level bar: it is a
          // thing you go looking for, not one you navigate by.
          { label: t("orders"), href: "/orders" },
          { label: t("signOut"), onClick: handleSignOut },
        ],
      }
    : { label: "", href: "/auth", icon: "/icons/user.svg" };

  // Every applicable item stays in the bar on every page - including Home and
  // the current page. The shared Navbar marks the active item with a bottom
  // border (via usePathname), so we no longer hide the page you are on.
  const navItems = [
    { label: t("home"), href: "/" },
    ...(productCount > 0
      ? [{ label: t("products"), href: "/categories/products" }]
      : []),
    ...(serviceCount > 0
      ? [{ label: t("services"), href: "/categories/services" }]
      : []),
    ...(foodCount > 0 ? [{ label: t("food"), href: "/categories/food" }] : []),
    // Favorites and the cart are shown to everyone: a guest has both, kept in
    // their browser and merged into their account when they sign in. Order
    // history stays signed-in only - a guest reaches their order by its link,
    // and there is no list of "their" orders to show.
    { label: t("favorites"), href: "/favorites" },
    {
      label: count > 0 ? `${t("cart")} (${count})` : t("cart"),
      href: "/cart",
    },
    ...(isLoggedIn ? [{ label: t("orders"), href: "/orders" }] : []),
    ...(isAdmin ? [{ label: t("admin"), href: "/admin" }] : []),
  ];

  return (
    <Navbar
      logo={logo}
      items={navItems}
      fixedItems={[authItem]}
      version={version}
      translucent
    />
  );
}
