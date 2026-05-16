'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from '@repo/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Navbar } from '@repo/ui/core-elements/navbar';
import type { NavbarProps } from '@repo/ui/core-elements/navbar';
import { SpeechButton } from '@repo/ui/core-elements/speech-button';
import { Button } from '@repo/ui/core-elements/button';
import { TextInput } from '@repo/ui/core-elements/text-input';
import { Box } from '@repo/ui/core-elements/box';
import { ConfirmationModal } from '@repo/ui/core-elements/confirmation-modal';
import { setSearchQuery, useSearchQuery } from './use-search-store';

type NavbarWithSearchProps = Omit<
  NavbarProps,
  | 'onSearch'
  | 'onSearchChange'
  | 'items'
  | 'searchValue'
  | 'rightSlot'
  | 'searchBox'
>;

export function NavbarWithSearch(props: NavbarWithSearchProps) {
  const pathname = usePathname();
  const t = useTranslations('Navbar');
  const locale = useLocale();
  const whisperLang = locale.slice(0, 2);
  const searchQuery = useSearchQuery();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalQuery, setModalQuery] = useState('');

  // When the search store is cleared externally (e.g. "Clear search" in VideoGrid),
  // keep modal query in sync.
  useEffect(() => {
    if (!searchQuery) setModalQuery('');
  }, [searchQuery]);

  const allItems = [
    { label: t('home'), href: '/' },
    { label: t('infinite'), href: '/infinite' },
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
        {...props}
        searchBox={false}
        items={items}
        rightSlot={
          <Button
            icon="/icons/search.svg"
            aria-label={t('searchModal.openLabel')}
            onClick={() => setModalOpen(true)}
            iconSize="20px"
            styles={{ cursor: 'pointer' }}
            kind="success"
          />
        }
      />
      {modalOpen && (
        <ConfirmationModal
          title={t('searchModal.title')}
          text={t('searchModal.description')}
          okCallback={handleOk}
          cancelCallback={handleCancel}
          panelMaxWidth="480px"
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
