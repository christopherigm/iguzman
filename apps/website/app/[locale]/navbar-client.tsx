'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@repo/i18n/navigation';
import { Navbar } from '@repo/ui/core-elements/navbar';
import { getAccessToken, getRefreshToken, clearTokens } from '@/lib/auth';

interface NavbarClientProps {
  logo: string;
  version: string;
}

export function NavbarClient({ logo, version }: NavbarClientProps) {
  const t = useTranslations('Navbar');
  const pathname = usePathname();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const syncAuth = () => {
    const access = getAccessToken();
    const refresh = getRefreshToken();
    setIsLoggedIn(Boolean(access && refresh));
  };

  useEffect(() => {
    syncAuth();
    window.addEventListener('auth-changed', syncAuth);
    return () => window.removeEventListener('auth-changed', syncAuth);
  }, []);

  const handleSignOut = () => {
    clearTokens();
    window.location.reload();
  };

  const authItem = isLoggedIn
    ? {
        label: '',
        icon: '/icons/user.svg',
        children: [
          { label: t('myAccount'), href: '/my-account' },
          { label: t('signOut'), onClick: handleSignOut },
        ],
      }
    : { label: '', href: '/auth', icon: '/icons/user.svg' };

  return (
    <Navbar
      logo={logo}
      items={pathname === '/' ? [] : [{ label: 'Home', href: '/' }]}
      fixedItems={[authItem]}
      version={version}
      translucent
    />
  );
}
