import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { SectionHero } from "@/components/section-hero";
import { RichText } from "@repo/ui/core-elements/rich-text";
import { getSuccessStory } from "@/lib/success-stories";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import type { GalleryImage } from "@/components/item-gallery-client";
import "@/components/item-detail.css";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const story = await getSuccessStory(slug);
  if (!story) return {};

  const name =
    (locale === "en" ? story.en_name : story.name) ??
    story.name ??
    story.en_name ??
    slug;

  const description =
    (locale === "en" ? story.en_short_description : story.short_description) ??
    story.short_description ??
    story.en_short_description ??
    undefined;

  return {
    title: name,
    description: description ?? undefined,
    openGraph: {
      title: name,
      description: description ?? undefined,
      images: story.image ? [{ url: story.image }] : undefined,
    },
  };
}

export default async function SuccessStoryDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [story, t] = await Promise.all([
    getSuccessStory(slug),
    getTranslations("SuccessStoryDetail"),
  ]);

  if (!story) notFound();

  const name =
    (locale === "en" ? story.en_name : story.name) ??
    story.name ??
    story.en_name ??
    slug;

  const shortDescription =
    (locale === "en" ? story.en_short_description : story.short_description) ??
    story.short_description ??
    story.en_short_description ??
    null;

  const description =
    (locale === "en" ? story.en_description : story.description) ??
    story.description ??
    story.en_description ??
    null;

  const formattedDate = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(story.created));

  const galleryImages: GalleryImage[] = [
    ...(story.image ? [{ url: story.image, alt: name }] : []),
    ...(story.images ?? [])
      .filter((img) => Boolean(img.image))
      .map((img) => ({
        url: img.image!,
        alt:
          (locale === "en" ? img.en_name : img.name) ??
          img.name ??
          img.en_name ??
          "",
      })),
  ];

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("successStories"), href: "/blog" },
    { label: name },
  ];

  const hasImage = Boolean(story.image);

  return (
    <>
      {hasImage && (
        <SectionHero
          backgroundImage={story.image}
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
          color="var(--accent-text)"
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
                placeholderColor={story.background_color ?? undefined}
              />
            </Grid>
          )}
          {description && (
            <Grid size={{ xs: 12, sm: galleryImages.length > 0 ? 6 : 12 }}>
              <Box
                paddingRight={20}
                className="item-detail__description item-detail__center-mobile"
              >
                <RichText>{description}</RichText>
              </Box>
            </Grid>
          )}
        </Grid>
      </Container>
    </>
  );
}
