"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "@repo/i18n/navigation";
import { Navbar } from "@repo/ui/core-elements/navbar";
import { useSession } from "@repo/auth/session-provider";
import { useAuthActions } from "@repo/auth/use-auth-actions";

interface NavbarClientProps {
  logo: string;
  version: string;
  productCount: number;
  serviceCount: number;
}

export function NavbarClient({
  logo,
  version,
  productCount,
  serviceCount,
}: NavbarClientProps) {
  const t = useTranslations("Navbar");
  const pathname = usePathname();
  // Comes from the server via SessionProvider, decoded from the access-token
  // cookie - so the admin link and the account menu are already right in the
  // first HTML instead of popping in after hydration.
  const session = useSession();
  const { signOut } = useAuthActions();

  const isLoggedIn = session !== null;
  const isAdmin = session?.isAdmin === true;

  const handleSignOut = () => void signOut("/");

  const authItem = isLoggedIn
    ? {
        label: "",
        icon: "/icons/user.svg",
        children: [
          { label: t("myAccount"), href: "/account" },
          { label: t("signOut"), onClick: handleSignOut },
        ],
      }
    : { label: "", href: "/auth", icon: "/icons/user.svg" };

  const navItems = [
    ...(pathname === "/" ? [] : [{ label: t("home"), href: "/" }]),
    ...(productCount > 0 && !pathname.startsWith("/categories/products")
      ? [{ label: t("products"), href: "/categories/products" }]
      : []),
    ...(serviceCount > 0 && !pathname.startsWith("/categories/services")
      ? [{ label: t("services"), href: "/categories/services" }]
      : []),
    ...(isAdmin && !pathname.startsWith("/admin")
      ? [{ label: t("admin"), href: "/admin" }]
      : []),
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
