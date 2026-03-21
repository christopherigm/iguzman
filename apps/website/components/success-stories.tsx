import { getTranslations, getLocale } from 'next-intl/server';
import { getSuccessStories } from '@/lib/success-stories';
import { Typography } from '@repo/ui/core-elements/typography';
import { StoriesSlider } from './stories-slider';
import './success-stories.css';
import Box from '@repo/ui/core-elements/box';

export async function SuccessStories() {
  const [stories, t, locale] = await Promise.all([
    getSuccessStories(),
    getTranslations('SuccessStories'),
    getLocale(),
  ]);

  if (stories.length === 0) return null;

  return (
    <section className="stories-section">
      <Box className="stories-header">
        <Typography as="h2" variant="h2" className="section-title">
          {t('heading')}
        </Typography>
      </Box>
      <StoriesSlider
        stories={stories}
        locale={locale}
        readMore={t('readMore')}
      />
    </section>
  );
}
