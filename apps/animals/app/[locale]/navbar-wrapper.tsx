'use client';

import { Navbar } from '@repo/ui/core-elements/navbar';
import type { MenuItem } from '@repo/ui/core-elements/navbar';
import { useSession } from '@repo/auth/session-provider';
import { useAuthActions } from '@repo/auth/use-auth-actions';

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: { home: string; catalog: string; account: string; signOut: string; admin: string };
  /**
   * The five branches, as the Catalog dropdown's children - built in the layout,
   * which is where the locale and the `Kinds` messages live.
   *
   * ⚠ **Their `href`s carry no locale**, exactly like `/account` and `/admin`
   * above: `Navbar` strips the locale off the pathname before matching an item
   * as active, so a prefixed href would never light up - and the intl proxy
   * redirects `/animals` to the reader's own locale on the way through.
   */
  branches: { label: string; href: string }[];
}

export function NavbarWrapper({ logo, version, labels, branches }: NavbarWrapperProps) {
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
        // A dropdown rather than five top-level items: the branches are one
        // thing (the catalog), and five more labels beside Account and Admin
        // would fill the bar. The parent deliberately carries **no `href`** -
        // there is no "all branches" page, and `Navbar` renders a parent with
        // children as a button anyway. It still lights up as active whenever one
        // of its children does, which is what makes the reader's branch visible
        // while they are on it. The drawer nests the same list on mobile.
        ...(branches.length > 0
          ? [{ label: labels.catalog, children: branches } satisfies MenuItem]
          : []),
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
