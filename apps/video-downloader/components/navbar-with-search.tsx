'use client';

import { useCallback } from 'react';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { NavbarProps } from '@repo/ui/core-elements/navbar';
import { setSearchQuery } from './use-search-store';

type NavbarWithSearchProps = Omit<NavbarProps, 'onSearch' | 'onSearchChange'>;

/**
 * Thin client wrapper around `Navbar` that wires the search box
 * to the shared search store so `VideoGrid` can filter in real-time.
 */
export function NavbarWithSearch(props: NavbarWithSearchProps) {
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  return (
    <Navbar
      {...props}
      onSearchChange={handleSearchChange}
      onSearch={handleSearch}
    />
  );
}
