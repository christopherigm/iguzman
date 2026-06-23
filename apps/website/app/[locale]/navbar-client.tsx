"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@repo/i18n/navigation";
import { Navbar } from "@repo/ui/core-elements/navbar";
import {
  getAccessToken,
  getRefreshToken,
  clearTokens,
  getUserFromToken,
} from "@/lib/auth";

function hasTokens(): boolean {
  return Boolean(getAccessToken() && getRefreshToken());
}

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
  // Seed auth state from tokens on the client (lazy init avoids a mount
  // setState-in-effect); the listener keeps it current on auth changes.
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => typeof window !== "undefined" && hasTokens(),
  );
  const [isAdmin, setIsAdmin] = useState(
    () => typeof window !== "undefined" && getUserFromToken()?.isAdmin === true,
  );

  useEffect(() => {
    const syncAuth = () => {
      setIsLoggedIn(hasTokens());
      setIsAdmin(getUserFromToken()?.isAdmin === true);
    };
    window.addEventListener("auth-changed", syncAuth);
    return () => window.removeEventListener("auth-changed", syncAuth);
  }, []);

  const handleSignOut = () => {
    clearTokens();
    window.location.reload();
  };

  const authItem = isLoggedIn
    ? {
        label: "",
        icon: "/icons/user.svg",
        children: [
          { label: t("myAccount"), href: "/my-account" },
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
