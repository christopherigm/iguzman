'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { MenuItem } from '@repo/ui/core-elements/navbar';
import { logout, clearUser, getStoredUser } from '@/lib/auth';

interface NavbarWrapperProps {
  logo: string;
  version: string;
  labels: {
    home: string;
    account: string;
    signOut: string;
  };
}

export function NavbarWrapper({ logo, version, labels }: NavbarWrapperProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(getStoredUser()?.displayName ?? null);

    const handler = (e: Event) => {
      setDisplayName(
        (e as CustomEvent<{ displayName: string | null }>).detail.displayName,
      );
    };
    window.addEventListener('ef-auth', handler);
    return () => window.removeEventListener('ef-auth', handler);
  }, []);

  const handleSignOut = async () => {
    await logout();
    clearUser();
    router.push('/auth');
  };

  const accountItem: MenuItem = displayName
    ? {
        label: displayName,
        children: [
          { label: labels.account, href: '/account' },
          { label: labels.signOut, onClick: handleSignOut },
        ],
      }
    : { label: labels.account, href: '/account' };

  const items: MenuItem[] = [{ label: labels.home, href: '/' }, accountItem];

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
