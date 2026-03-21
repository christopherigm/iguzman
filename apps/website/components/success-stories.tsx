import { getTranslations, getLocale } from 'next-intl/server';
import { getSuccessStories } from '@/lib/success-stories';
import { Typography } from '@repo/ui/core-elements/typography';
import { StoriesSlider } from './stories-slider';
import './success-stories.css';

export async function SuccessStories() {
  const [stories, t, locale] = await Promise.all([
    getSuccessStories(),
    getTranslations('SuccessStories'),
    getLocale(),
  ]);

  if (stories.length === 0) return null;

  return (
    <section className="stories-section">
      <Typography as="h2" variant="none" className="section-title">
        {t('heading')}
      </Typography>
      <StoriesSlider
        stories={stories}
        locale={locale}
        readMore={t('readMore')}
      />
    </section>
  );
}
