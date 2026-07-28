'use client';

import { Navbar } from '@repo/ui/core-elements/navbar';
import type { MenuItem } from '@repo/ui/core-elements/navbar';
import { useSession } from '@repo/auth/session-provider';
import { useAuthActions } from '@repo/auth/use-auth-actions';

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: { home: string; account: string; signOut: string; admin: string };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  // Comes from the server via SessionProvider, so it is already correct in the
  // first HTML - the navbar never renders logged-out for a logged-in user, and
  // the Admin link never pops in after hydration.
  const session = useSession();
  const { signOut } = useAuthActions();
  const displayName = session?.displayName ?? null;
  const isAdmin = session?.isAdmin === true;

  const handleSignOut = () => void signOut('/auth');

  const accountItem: MenuItem = displayName
    ? {
        label: displayName,
        children: [
          { label: labels.account, href: '/account' },
          { label: labels.signOut, onClick: handleSignOut },
        ],
      }
    : { label: labels.account, href: '/account' };

  return (
    <Navbar
      logo={logo}
      items={[
        { label: labels.home, href: '/' },
        // Presentation only, exactly like website's: `proxy.ts` guards the
        // route, the CMS re-checks `isAdmin`, and Django re-derives it from the
        // token on every call. ⚠ Claims freeze for the life of the refresh
        // token, so an account just granted `is_admin` must sign in again (or
        // hit `token/reissue/`) before this appears.
        ...(isAdmin ? [{ label: labels.admin, href: '/admin' }] : []),
        accountItem,
      ]}
      fixedItems={[]}
      version={version}
      translucent
    />
  );
}
