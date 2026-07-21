import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { SectionHero } from "@/components/section-hero";
import { getSuccessStories } from "@/lib/success-stories";
import { StoryCard } from "@/components/story-card";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "SuccessStories",
  })) as (key: string) => string;

  return {
    title: t("heading"),
  };
}

export default async function BlogPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [stories, t, detailT, adminT, session] = await Promise.all([
    getSuccessStories(),
    getTranslations("SuccessStories"),
    getTranslations("SuccessStoryDetail"),
    getTranslations("Admin"),
    getSession(),
  ]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: detailT("home"), href: "/" },
    { label: detailT("successStories") },
  ];

  const images = stories
    .flatMap((story) => [story.image, ...story.images.map((img) => img.image)])
    .filter(Boolean) as string[];
  // Server component: a fresh random hero per request is intentional and carries
  // no hydration concern (rendered once on the server).
  // eslint-disable-next-line react-hooks/purity
  const randomIndex = Math.floor(Math.random() * images.length);
  const heroImage = images.length > 0 ? images[randomIndex] : null;

  return (
    <>
      {heroImage && (
        <SectionHero
          backgroundImage={heroImage}
          slogan={t("heading")}
          style={{ height: "clamp(220px, 30vw, 400px)" }}
        />
      )}
      <Container
        size="lg"
        paddingX={10}
        marginTop={16}
        paddingTop={!heroImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Typography as="h1" variant="h1" marginBottom={32}>
          {t("heading")}
        </Typography>

        {stories.length > 0 ? (
          <Grid container spacing={2}>
            {stories.map((story) => (
              <Grid key={story.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <StoryCard
                  story={story}
                  locale={locale}
                  readMore={t("readMore")}
                  isAdmin={session?.isAdmin ?? false}
                  editLabel={adminT("edit")}
                />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Typography variant="body">{t("empty")}</Typography>
        )}
      </Container>
    </>
  );
}
