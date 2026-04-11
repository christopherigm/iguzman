'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container } from '@repo/ui/core-elements/container';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { Typography } from '@repo/ui/core-elements/typography';
import { TextInput } from '@repo/ui/core-elements/text-input';
import './music-form.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type Page = 'type' | 'lyrics' | 'settings';
type LyricsMode = 'custom' | 'generate';

// ── SVG arrow icons ───────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Step 1: type selection ────────────────────────────────────────────────────

function StepType({
  vocal,
  onSelect,
  t,
}: {
  vocal: boolean | null;
  onSelect: (value: boolean) => void;
  t: ReturnType<typeof useTranslations<'AppPage'>>;
}) {
  return (
    <Box display="flex" gap={16}>
      {/* Vocal option */}
      <Button
        unstyled
        className="music-form__option-card"
        onClick={() => onSelect(true)}
        flex={1}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={12}
        padding={24}
        borderRadius={12}
        border={vocal === true ? '2px solid var(--accent)' : '2px solid var(--border, #e5e7eb)'}
        backgroundColor={vocal === true ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent'}
        color="var(--foreground)"
        aria-pressed={vocal === true}
      >
        <Box
          width={64}
          height={64}
          borderRadius="50%"
          backgroundColor="rgba(255,255,255,0.85)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Image src="/icons/music.svg" width={40} height={40} alt="" />
        </Box>
        <Typography as="span" variant="body-sm" fontWeight={600}>
          {t('type.vocalLabel')}
        </Typography>
      </Button>

      {/* Instrumental option */}
      <Button
        unstyled
        className="music-form__option-card"
        onClick={() => onSelect(false)}
        flex={1}
        display="flex"
        flexDirection="column"
        alignItems="center"
        gap={12}
        padding={24}
        borderRadius={12}
        border={vocal === false ? '2px solid var(--accent)' : '2px solid var(--border, #e5e7eb)'}
        backgroundColor={vocal === false ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent'}
        color="var(--foreground)"
        aria-pressed={vocal === false}
      >
        <Box
          width={64}
          height={64}
          borderRadius="50%"
          backgroundColor="rgba(255,255,255,0.85)"
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          <Image src="/icons/instrumental.svg" width={40} height={40} alt="" />
        </Box>
        <Typography as="span" variant="body-sm" fontWeight={600}>
          {t('type.instrumentalLabel')}
        </Typography>
      </Button>
    </Box>
  );
}

// ── Step 2: lyrics ────────────────────────────────────────────────────────────

function StepLyrics({
  lyricsMode,
  lyrics,
  lyricsPrompt,
  onSelectMode,
  onLyricsChange,
  onPromptChange,
  t,
}: {
  lyricsMode: LyricsMode | null;
  lyrics: string;
  lyricsPrompt: string;
  onSelectMode: (mode: LyricsMode) => void;
  onLyricsChange: (v: string) => void;
  onPromptChange: (v: string) => void;
  t: ReturnType<typeof useTranslations<'AppPage'>>;
}) {
  return (
    <Box display="flex" flexDirection="column" gap={16}>
      {/* Sub-option buttons */}
      <Box display="flex" gap={8}>
        <Button
          unstyled
          className="music-form__lyric-btn"
          onClick={() => onSelectMode('custom')}
          flex={1}
          padding="10px 8px"
          borderRadius={8}
          border={lyricsMode === 'custom' ? '2px solid var(--accent)' : '2px solid var(--border, #e5e7eb)'}
          backgroundColor={lyricsMode === 'custom' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent'}
          color="var(--foreground)"
          aria-pressed={lyricsMode === 'custom'}
          styles={{ fontSize: 13 }}
        >
          {t('lyrics.ownLyrics')}
        </Button>

        <Button
          unstyled
          className="music-form__lyric-btn"
          onClick={() => onSelectMode('generate')}
          flex={1}
          padding="10px 8px"
          borderRadius={8}
          border={lyricsMode === 'generate' ? '2px solid var(--accent)' : '2px solid var(--border, #e5e7eb)'}
          backgroundColor={lyricsMode === 'generate' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent'}
          color="var(--foreground)"
          aria-pressed={lyricsMode === 'generate'}
          styles={{ fontSize: 13 }}
        >
          {t('lyrics.generateLyrics')}
        </Button>
      </Box>

      {/* Conditional textarea */}
      {lyricsMode === 'custom' && (
        <TextInput
          label={t('lyrics.lyricsLabel')}
          value={lyrics}
          onChange={onLyricsChange}
          multirow
          rows={8}
        />
      )}

      {lyricsMode === 'generate' && (
        <TextInput
          label={t('lyrics.promptLabel')}
          value={lyricsPrompt}
          onChange={onPromptChange}
          multirow
          rows={4}
        />
      )}
    </Box>
  );
}

// ── Step 3: placeholder ───────────────────────────────────────────────────────

function StepSettings({
  t,
}: {
  t: ReturnType<typeof useTranslations<'AppPage'>>;
}) {
  return (
    <Box display="flex" flexDirection="column" alignItems="center" gap={8} padding={24}>
      <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)" styles={{ textAlign: 'center' }}>
        {t('settings.placeholder')}
      </Typography>
    </Box>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function MusicForm() {
  const t = useTranslations('AppPage');

  const [vocal, setVocal] = useState<boolean | null>(null);
  const [lyricsMode, setLyricsMode] = useState<LyricsMode | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [lyricsPrompt, setLyricsPrompt] = useState('');
  const [currentPage, setCurrentPage] = useState<Page>('type');

  // ── Visible pages (determines dot count) ──────────────────────────────────
  const visiblePages: Page[] = vocal === true
    ? ['type', 'lyrics', 'settings']
    : ['type', 'settings'];

  const currentDotIndex = visiblePages.indexOf(currentPage);

  // ── Can proceed to next step ──────────────────────────────────────────────
  const canGoNext: boolean = (() => {
    if (currentPage === 'type') return vocal !== null;
    if (currentPage === 'lyrics') {
      if (lyricsMode === null) return false;
      if (lyricsMode === 'custom') return lyrics.trim().length > 0;
      return lyricsPrompt.trim().length > 0;
    }
    return false;
  })();

  // ── Navigation ────────────────────────────────────────────────────────────
  function goNext() {
    if (!canGoNext) return;
    if (currentPage === 'type') {
      setCurrentPage(vocal ? 'lyrics' : 'settings');
    } else if (currentPage === 'lyrics') {
      setCurrentPage('settings');
    }
  }

  function goBack() {
    if (currentPage === 'lyrics') setCurrentPage('type');
    else if (currentPage === 'settings') setCurrentPage(vocal ? 'lyrics' : 'type');
  }

  // ── Selecting vocal resets downstream state ───────────────────────────────
  function selectVocal(value: boolean) {
    if (vocal !== value) {
      setLyricsMode(null);
      setLyrics('');
      setLyricsPrompt('');
    }
    setVocal(value);
  }

  // ── Selecting lyrics mode resets textarea content ─────────────────────────
  function selectLyricsMode(mode: LyricsMode) {
    if (lyricsMode !== mode) {
      setLyrics('');
      setLyricsPrompt('');
    }
    setLyricsMode(mode);
  }

  // ── Step title / subtitle ─────────────────────────────────────────────────
  const stepMeta: Record<Page, { title: string; subtitle: string }> = {
    type: { title: t('type.title'), subtitle: t('type.subtitle') },
    lyrics: { title: t('lyrics.title'), subtitle: t('lyrics.subtitle') },
    settings: { title: t('settings.title'), subtitle: t('settings.subtitle') },
  };
  const { title, subtitle } = stepMeta[currentPage];

  return (
    <Container
      display="flex"
      alignItems="center"
      styles={{
        minHeight: '100vh',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        paddingTop: 'var(--ui-navbar-height)',
      }}
      paddingX={10}
    >
      {/* Title row (outside the card, like auth-form) */}
      <Box width="100%" maxWidth={420} marginBottom={20} marginTop={32}>
        <Typography as="h1" variant="h2" fontWeight={600} marginBottom={4}>
          {title}
        </Typography>
        <Typography variant="body-sm" color="var(--muted-foreground, #6b7280)">
          {subtitle}
        </Typography>
      </Box>

      {/* Form card */}
      <Box
        width="100%"
        maxWidth={420}
        padding={10}
        borderRadius={12}
        display="flex"
        flexDirection="column"
        gap={20}
        elevation={5}
        backgroundColor="var(--surface-1)"
      >
        {/* Step content */}
        {currentPage === 'type' && (
          <StepType vocal={vocal} onSelect={selectVocal} t={t} />
        )}
        {currentPage === 'lyrics' && (
          <StepLyrics
            lyricsMode={lyricsMode}
            lyrics={lyrics}
            lyricsPrompt={lyricsPrompt}
            onSelectMode={selectLyricsMode}
            onLyricsChange={setLyrics}
            onPromptChange={setLyricsPrompt}
            t={t}
          />
        )}
        {currentPage === 'settings' && (
          <StepSettings t={t} />
        )}

        {/* Navigation row */}
        <Box display="flex" alignItems="center" justifyContent="space-between" marginTop={4}>
          {/* Back arrow */}
          <Button
            unstyled
            className="music-form__arrow-btn"
            onClick={goBack}
            disabled={currentPage === 'type'}
            width={36}
            height={36}
            borderRadius="50%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="var(--foreground)"
            aria-label={t('nav.back')}
          >
            <ChevronLeft />
          </Button>

          {/* Dots */}
          <Box display="flex" gap={8} alignItems="center" role="tablist" aria-label="Steps">
            {visiblePages.map((_, i) => (
              <Box
                key={i}
                className={`music-form__dot${i === currentDotIndex ? ' music-form__dot--active' : ''}`}
                width={8}
                height={8}
                borderRadius="50%"
                backgroundColor={i === currentDotIndex ? 'var(--accent)' : 'var(--border, #d1d5db)'}
                role="tab"
                aria-selected={i === currentDotIndex}
              />
            ))}
          </Box>

          {/* Next arrow */}
          <Button
            unstyled
            className="music-form__arrow-btn"
            onClick={goNext}
            disabled={!canGoNext || currentPage === 'settings'}
            width={36}
            height={36}
            borderRadius="50%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            color="var(--foreground)"
            aria-label={t('nav.next')}
          >
            <ChevronRight />
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
