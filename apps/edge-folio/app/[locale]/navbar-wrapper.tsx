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
    matrix: string;
    extract: string;
    applications: string;
    jobs: string;
    workExperience: string;
    education: string;
    profile: string;
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

  const dashboardItems: MenuItem[] = displayName
    ? [
        { label: labels.jobs, href: "/jobs" },
        { label: labels.applications, href: "/applications" },
        { label: labels.matrix, href: "/matrix" },
        { label: labels.workExperience, href: "/work-experience" },
        { label: labels.education, href: "/education" },
        { label: labels.profile, href: "/profile" },
        // { label: labels.extract, href: "/extract" },
      ]
    : [];

  const items: MenuItem[] = [
    { label: labels.home, href: "/" },
    ...dashboardItems,
    accountItem,
  ];

  return (
    <Navbar
      logo={logo}
      items={items}
      fixedItems={[]}
      version={version}
      translucent
    />
  );
}
