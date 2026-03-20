import { getTranslations, getLocale } from 'next-intl/server';
import { getSuccessStories, type SuccessStory } from '@/lib/success-stories';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import './success-stories.css';

function StoryCard({
  story,
  locale,
  readMore,
}: {
  story: SuccessStory;
  locale: string;
  readMore: string;
}) {
  const name =
    (locale === 'en' ? story.en_name : story.name) ??
    story.name ??
    story.en_name ??
    '';
  const description =
    (locale === 'en' ? story.en_description : story.description) ??
    story.description ??
    story.en_description ??
    '';
  const date = new Date(story.created).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const hasImage = Boolean(story.image);

  const boxContent = (
    <Box
      elevation={5}
      borderRadius={12}
      padding={10}
      styles={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: story.background_color ?? '#111827',
      }}
    >
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="story-card__image" src={story.image!} alt={name} />
      )}

      <Box
        className={`story-card__overlay${hasImage ? '' : ' story-card__overlay--no-image'}`}
      />

      <Box className="story-card__date">{date}</Box>

      <Box className="story-card__body">
        {name && (
          <Typography
            as="h3"
            variant="none"
            color="#fff"
            className="story-card__name"
          >
            {name}
          </Typography>
        )}

        {description && (
          <Typography
            variant="none"
            color="rgba(255,255,255,0.8)"
            className="story-card__description"
          >
            {description}
          </Typography>
        )}

        {story.href && (
          <Box className="story-card__cta">
            <span className="story-card__cta-btn">{readMore} →</span>
          </Box>
        )}
      </Box>
    </Box>
  );

  if (story.href) {
    return (
      <a
        href={story.href}
        target="_blank"
        rel="noopener noreferrer"
        className="story-card"
      >
        {boxContent}
      </a>
    );
  }

  return <article className="story-card">{boxContent}</article>;
}

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
      <Box className="stories-track" marginTop={20}>
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            locale={locale}
            readMore={t('readMore')}
          />
        ))}
      </Box>
    </section>
  );
}
