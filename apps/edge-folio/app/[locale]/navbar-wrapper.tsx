"use client";

import { Navbar } from "@repo/ui/core-elements/navbar";
import type { MenuItem } from "@repo/ui/core-elements/navbar";
import { useSession } from "@repo/auth/session-provider";
import { useAuthActions } from "@repo/auth/use-auth-actions";

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
  // Comes from the server via SessionProvider, so it is already correct in the
  // first HTML - the navbar never renders logged-out for a logged-in user.
  const session = useSession();
  // useAuthActions routes through @repo/i18n/navigation, so signing out keeps the
  // locale prefix. The old next/navigation router dropped it (/es/... → /auth).
  const { signOut } = useAuthActions();
  const displayName = session?.displayName ?? null;

  const handleSignOut = () => void signOut("/auth");

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
