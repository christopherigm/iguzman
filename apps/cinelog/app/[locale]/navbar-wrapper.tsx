"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@repo/ui/core-elements/navbar";
import type { MenuItem } from "@repo/ui/core-elements/navbar";
import { logout, clearUser, getStoredUser } from "@/lib/auth";

// The stored user lives in localStorage; `app-auth` is dispatched (after the
// store is updated) whenever it changes. Reading it through useSyncExternalStore
// avoids a setState-in-effect on mount.
function subscribeAuth(callback: () => void): () => void {
  window.addEventListener("app-auth", callback);
  return () => window.removeEventListener("app-auth", callback);
}

function getDisplayNameSnapshot(): string | null {
  return getStoredUser()?.displayName ?? null;
}

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: {
    home: string;
    scan: string;
    inbox: string;
    account: string;
    signOut: string;
  };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  const router = useRouter();
  const displayName = useSyncExternalStore(
    subscribeAuth,
    getDisplayNameSnapshot,
    () => null,
  );

  const handleSignOut = async () => {
    await logout();
    clearUser();
    router.push("/auth");
  };

  const accountItem: MenuItem = displayName
    ? {
        label: displayName,
        children: [
          { label: labels.account, href: "/account" },
          { label: labels.signOut, onClick: handleSignOut },
        ],
      }
    : { label: labels.account, href: "/account" };

  return (
    <Navbar
      logo={logo}
      items={[
        { label: labels.home, href: "/" },
        ...(displayName
          ? [
              { label: labels.scan, href: "/scan" },
              { label: labels.inbox, href: "/inbox" },
            ]
          : []),
        accountItem,
      ]}
      fixedItems={[]}
      version={version}
      translucent
    />
  );
}
