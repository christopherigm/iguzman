'use client';

import { useCallback } from 'react';
import { usePathname } from '@repo/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { NavbarProps } from '@repo/ui/core-elements/navbar';
import { setSearchQuery } from './use-search-store';

type NavbarWithSearchProps = Omit<NavbarProps, 'onSearch' | 'onSearchChange' | 'items'>;

/**
 * Thin client wrapper around `Navbar` that wires the search box
 * to the shared search store so `VideoGrid` can filter in real-time.
 * Builds nav items dynamically, hiding the current page's item.
 */
export function NavbarWithSearch(props: NavbarWithSearchProps) {
  const pathname = usePathname();
  const t = useTranslations('Navbar');

  const allItems = [
    { label: t('home'), href: '/' },
    { label: t('infinite'), href: '/infinite' },
  ];
  const items = allItems.filter((item) => item.href !== pathname);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  return (
    <Navbar
      {...props}
      items={items}
      onSearchChange={handleSearchChange}
      onSearch={handleSearch}
    />
  );
}
