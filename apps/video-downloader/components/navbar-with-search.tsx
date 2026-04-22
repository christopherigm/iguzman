'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from '@repo/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { NavbarProps } from '@repo/ui/core-elements/navbar';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { setSearchQuery, useSearchQuery } from './use-search-store';

type NavbarWithSearchProps = Omit<
  NavbarProps,
  'onSearch' | 'onSearchChange' | 'items' | 'searchValue' | 'rightSlot'
>;

/**
 * Thin client wrapper around `Navbar` that wires the search box
 * to the shared search store so `VideoGrid` can filter in real-time.
 * Builds nav items dynamically, hiding the current page's item.
 *
 * When `searchBox` is enabled, a `SpeechButton` is rendered next to the
 * search icon.  Press it to record voice, release to transcribe — the
 * resulting text is injected into the search box and updates the grid.
 */
export function NavbarWithSearch(props: NavbarWithSearchProps) {
  const pathname = usePathname();
  const t = useTranslations('Navbar');
  const locale = useLocale();
  const whisperLang = locale.slice(0, 2);
  const searchQuery = useSearchQuery();
  const [speechTranscript, setSpeechTranscript] = useState('');

  // When the search store is cleared externally (e.g. the "Clear search" button
  // in VideoGrid), reset the controlled value so the navbar search box clears too.
  useEffect(() => {
    if (!searchQuery) setSpeechTranscript('');
  }, [searchQuery]);

  const allItems = [
    { label: t('home'), href: '/' },
    { label: t('infinite'), href: '/infinite' },
    { label: t('terms'), href: '/terms' },
  ];
  const items = allItems.filter((item) => item.href !== pathname);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const handleTranscript = useCallback((text: string) => {
    const cleaned = text.replace(/[.,!?]+$/, '');
    setSpeechTranscript(cleaned);
    setSearchQuery(cleaned);
  }, []);

  return (
    <Navbar
      {...props}
      items={items}
      onSearchChange={handleSearchChange}
      onSearch={handleSearch}
      searchValue={speechTranscript}
      rightSlot={
        props.searchBox ? (
          <SpeechButton
            mode="batch"
            language={whisperLang}
            onTranscript={handleTranscript}
            micIcon="/icons/mic.svg"
          />
        ) : undefined
      }
    />
  );
}
