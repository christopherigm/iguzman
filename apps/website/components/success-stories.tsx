import { getTranslations, getLocale } from 'next-intl/server';
import { getSuccessStories, type SuccessStory } from '@/lib/success-stories';
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

  const cardContent = (
    <>
      {hasImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="story-card__image" src={story.image!} alt={name} />
      )}

      <div
        className={`story-card__overlay${hasImage ? '' : ' story-card__overlay--no-image'}`}
      />

      <div className="story-card__date">{date}</div>

      <div className="story-card__body">
        {name && <h3 className="story-card__name">{name}</h3>}

        {description && (
          <p className="story-card__description">{description}</p>
        )}

        {story.href && (
          <div className="story-card__cta">
            <span className="story-card__cta-btn">{readMore} →</span>
          </div>
        )}
      </div>
    </>
  );

  const bgStyle = story.background_color
    ? { backgroundColor: story.background_color }
    : undefined;

  if (story.href) {
    return (
      <a
        href={story.href}
        target="_blank"
        rel="noopener noreferrer"
        className="story-card"
        style={bgStyle}
      >
        {cardContent}
      </a>
    );
  }

  return (
    <article className="story-card" style={bgStyle}>
      {cardContent}
    </article>
  );
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
      <h2 className="stories-heading">{t('heading')}</h2>
      <div className="stories-track">
        {stories.map((story) => (
          <StoryCard
            key={story.id}
            story={story}
            locale={locale}
            readMore={t('readMore')}
          />
        ))}
      </div>
    </section>
  );
}
