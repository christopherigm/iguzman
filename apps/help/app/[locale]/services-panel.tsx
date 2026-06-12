'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Button } from '@repo/ui/core-elements/button';
import { ScraperPanel } from './scraper-panel';
import { DiarizationPanel } from './diarization-panel';

type Service = 'scraper' | 'diarization';

export function ServicesPanel() {
  const t = useTranslations('HomePage');
  const [service, setService] = useState<Service>('scraper');

  return (
    <>
      <Box display="flex" gap={8} marginBottom={32}>
        <Button
          text={t('servicesScraperBtn')}
          size="sm"
          onClick={() => setService('scraper')}
          aria-pressed={service === 'scraper'}
          backgroundColor={service === 'scraper' ? 'var(--accent)' : undefined}
          color={service === 'scraper' ? 'var(--accent-foreground, #fff)' : undefined}
        />
        <Button
          text={t('servicesDiarizationBtn')}
          size="sm"
          onClick={() => setService('diarization')}
          aria-pressed={service === 'diarization'}
          backgroundColor={service === 'diarization' ? 'var(--accent)' : undefined}
          color={service === 'diarization' ? 'var(--accent-foreground, #fff)' : undefined}
        />
      </Box>
      {service === 'scraper' && <ScraperPanel />}
      {service === 'diarization' && <DiarizationPanel />}
    </>
  );
}
