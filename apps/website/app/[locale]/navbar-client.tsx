'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Navbar } from '@repo/ui/core-elements/navbar';
import {
  getAccessToken,
  getRefreshToken,
  clearTokens,
  getUserFromToken,
} from '@/lib/auth';

interface NavbarClientProps {
  logo: string;
  version: string;
}

export function NavbarClient({ logo, version }: NavbarClientProps) {
  const t = useTranslations('Navbar');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const syncAuth = () => {
    const access = getAccessToken();
    const refresh = getRefreshToken();
    const loggedIn = Boolean(access && refresh);
    setIsLoggedIn(loggedIn);

    if (loggedIn) {
      const user = getUserFromToken();
      if (user?.firstName) {
        setUserName(
          user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName,
        );
      } else if (user?.email) {
        setUserName(user.email);
      } else {
        setUserName(null);
      }
    } else {
      setUserName(null);
    }
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

  const MAX_LABEL_LENGTH = 5;
  const displayName = userName
    ? userName.length > MAX_LABEL_LENGTH
      ? `${userName.slice(0, MAX_LABEL_LENGTH)}…`
      : userName
    : null;

  const authItem = isLoggedIn
    ? {
        label: displayName ?? t('myAccount'),
        icon: '/icons/user.svg',
        children: [
          { label: t('myAccount'), href: '/my-account' },
          { label: t('signOut'), onClick: handleSignOut },
        ],
      }
    : { label: t('accessAccount'), href: '/auth', icon: '/icons/user.svg' };

  return (
    <Navbar
      logo={logo}
      items={[{ label: 'Home', href: '/' }]}
      fixedItems={[authItem]}
      version={version}
    />
  );
}
