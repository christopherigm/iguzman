import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { SectionHero } from "@/components/section-hero";
import { getHighlights } from "@/lib/highlights";
import {
  HighlightCard,
  HIGHLIGHT_GRID_SIZE,
} from "@/components/company-highlights";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "Highlights",
  })) as (key: string) => string;

  return {
    title: t("heading"),
  };
}

export default async function HighlightsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [highlights, t, detailT] = await Promise.all([
    getHighlights(),
    getTranslations("Highlights"),
    getTranslations("HighlightDetail"),
  ]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: detailT("home"), href: "/" },
    { label: detailT("highlights") },
  ];

  const images = highlights
    .flatMap((highlight) => [
      highlight.image,
      ...highlight.items.map((item) => item.image),
    ])
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

        {highlights.length > 0 ? (
          <Grid container spacing={2}>
            {highlights.map((highlight) => (
              <Grid
                key={highlight.id}
                size={HIGHLIGHT_GRID_SIZE[highlight.size] ?? { xs: 12 }}
              >
                <HighlightCard highlight={highlight} locale={locale} />
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
