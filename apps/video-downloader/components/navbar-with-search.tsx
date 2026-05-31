'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from '@repo/i18n/navigation';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { NavbarProps } from '@repo/ui/core-elements/navbar';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { Button } from '@repo/ui/core-elements/button';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Box } from '@repo/ui/core-elements/box';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { setSearchQuery, useSearchQuery } from './use-search-store';
import { useCreditsBalance } from './use-credits-store';

type NavbarWithSearchProps = Omit<
  NavbarProps,
  | 'onSearch'
  | 'onSearchChange'
  | 'items'
  | 'searchValue'
  | 'rightSlot'
  | 'searchBox'
> & {
  searchHiddenPaths?: string[];
  creditsHiddenPaths?: string[];
};

export function NavbarWithSearch(props: NavbarWithSearchProps) {
  const { searchHiddenPaths, creditsHiddenPaths, ...navbarProps } = props;
  const pathname = usePathname();
  const showSearch = !searchHiddenPaths?.includes(pathname);
  const showCredits = !creditsHiddenPaths?.includes(pathname);
  const t = useTranslations('Navbar');
  const locale = useLocale();
  const whisperLang = locale.slice(0, 2);
  const searchQuery = useSearchQuery();
  const creditsBalance = useCreditsBalance();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState('');

  // When the search store is cleared externally (e.g. "Clear search" in VideoGrid),
  // keep modal query in sync.
  useEffect(() => {
    if (!searchQuery) setModalQuery('');
  }, [searchQuery]);

  const allItems = [
    { label: t('home'), href: '/' },
    { label: t('reelMode'), href: '/reel-mode' },
    { label: t('musicPlayer'), href: '/music-player' },
    { label: t('buyCredits'), href: '/credits' },
    { label: t('terms'), href: '/terms' },
  ];
  const items = allItems.filter((item) => item.href !== pathname);

  const handleQueryChange = useCallback((value: string) => {
    setModalQuery(value);
    setSearchQuery(value);
  }, []);

  const handleTranscript = useCallback((text: string) => {
    const cleaned = text.replace(/[.,!?]+$/, '');
    setModalQuery(cleaned);
    setSearchQuery(cleaned);
  }, []);

  const handleOk = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleCancel = useCallback(() => {
    setModalQuery('');
    setSearchQuery('');
    setModalOpen(false);
  }, []);

  return (
    <>
      <Navbar
        {...navbarProps}
        hiddenPaths={['/reel-mode', '/music-player', ...(navbarProps.hiddenPaths ?? [])]}
        searchBox={false}
        items={items}
        rightSlot={
          <Box display="flex" alignItems="center" gap={14}>
            {showCredits && (
              <Link
                href="/credits"
                prefetch
                style={{
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  whiteSpace: 'nowrap',
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                🪙 {creditsBalance}
              </Link>
            )}
            {showSearch && (
              <Button
                icon="/icons/search.svg"
                aria-label={t('searchModal.openLabel')}
                onClick={() => setModalOpen(true)}
                iconSize="20px"
                styles={{ cursor: 'pointer' }}
                kind="success"
              />
            )}
          </Box>
        }
      />
      {modalOpen && (
        <ConfirmationModal
          title={t('searchModal.title')}
          text={t('searchModal.description')}
          okCallback={handleOk}
          cancelCallback={handleCancel}
          panelMaxWidth="480px"
          position="top"
          backgroundBlur=""
        >
          <Box display="flex" flexDirection="column" gap={12}>
            <TextInput
              label={t('searchModal.inputLabel')}
              value={modalQuery}
              onChange={handleQueryChange}
            />
            <Box display="flex" justifyContent="center">
              <SpeechButton
                mode="batch"
                language={whisperLang}
                onTranscript={handleTranscript}
                micIcon="/icons/mic.svg"
              />
            </Box>
          </Box>
        </ConfirmationModal>
      )}
    </>
  );
}
