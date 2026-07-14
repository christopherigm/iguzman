"use client";

import { Navbar } from "@repo/ui/core-elements/navbar";
import type { MenuItem } from "@repo/ui/core-elements/navbar";
import { useSession } from "@repo/auth/session-provider";
import { useAuthActions } from "@repo/auth/use-auth-actions";

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: { home: string; analysis: string; account: string; signOut: string };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  // Comes from the server via SessionProvider, so it is already correct in the
  // first HTML - the navbar never renders logged-out for a logged-in user.
  const session = useSession();
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

  return (
    <Navbar
      logo={logo}
      items={[
        { label: labels.home, href: "/" },
        { label: labels.analysis, href: "/analysis" },
        accountItem,
      ]}
      fixedItems={[]}
      version={version}
      translucent
    />
  );
}
