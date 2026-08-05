import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { getHighlight } from "@/lib/highlights";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import type { GalleryImage } from "@/components/item-gallery-client";
import "@/components/item-detail.css";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function HighlightDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [highlight, t] = await Promise.all([
    getHighlight(slug),
    getTranslations("HighlightDetail"),
  ]);

  if (!highlight) notFound();

  const name =
    (locale === "en" ? highlight.en_name : highlight.name) ??
    highlight.name ??
    highlight.en_name ??
    slug;

  const shortDescription =
    (locale === "en"
      ? highlight.en_short_description
      : highlight.short_description) ??
    highlight.short_description ??
    highlight.en_short_description ??
    null;

  const description =
    (locale === "en" ? highlight.en_description : highlight.description) ??
    highlight.description ??
    highlight.en_description ??
    null;

  const formattedDate = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(highlight.created));

  const galleryImages: GalleryImage[] = [
    ...(highlight.image ? [{ url: highlight.image, alt: name }] : []),
    ...highlight.items
      .filter((item) => Boolean(item.image))
      .map((item) => ({
        url: item.image!,
        alt:
          (locale === "en" ? item.en_name : item.name) ??
          item.name ??
          item.en_name ??
          "",
      })),
  ];

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("highlights"), href: "/highlights" },
    { label: name },
  ];

  const hasImage = Boolean(highlight.image);

  return (
    <>
      {hasImage && (
        <SectionHero
          backgroundImage={highlight.image}
          slogan={name}
          style={{ height: "clamp(220px, 30vw, 500px)" }}
        />
      )}
      <Container
        size="lg"
        paddingX={10}
        marginTop={16}
        paddingTop={!hasImage ? "var(--ui-navbar-height, 57px)" : undefined}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Typography
          as="span"
          variant="label"
          color="var(--accent)"
          fontWeight={700}
          marginBottom={8}
          styles={{
            display: "block",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {formattedDate}
        </Typography>
        <Typography as="h1" variant="h1">
          {name}
        </Typography>
        {shortDescription && (
          <Typography
            variant="body"
            marginTop={16}
            className="item-detail__center-mobile"
          >
            {shortDescription}
          </Typography>
        )}
        <Grid container spacing={3} marginTop={32}>
          {galleryImages.length > 0 && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <ItemGalleryClient
                images={galleryImages}
                placeholderColor={highlight.background_color ?? undefined}
              />
            </Grid>
          )}
          {description && (
            <Grid size={{ xs: 12, sm: galleryImages.length > 0 ? 6 : 12 }}>
              <Box
                paddingRight={20}
                className="item-detail__description item-detail__center-mobile"
              >
                <Typography
                  variant="body"
                  styles={{ whiteSpace: "pre-line", lineHeight: 1.75 }}
                >
                  {description}
                </Typography>
              </Box>
            </Grid>
          )}
        </Grid>
      </Container>
    </>
  );
}
