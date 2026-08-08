import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Badge } from "@repo/ui/core-elements/badge";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Card } from "@repo/ui/core-elements/card";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Grid } from "@repo/ui/core-elements/grid";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { RichText } from "@repo/ui/core-elements/rich-text";
import { SectionHero } from "@/components/section-hero";
import { ItemGalleryClient } from "@/components/item-gallery-client";
import type { GalleryImage } from "@/components/item-gallery-client";
import { PlaceMap } from "@/components/place-map";
import { AdminEditButton } from "@/components/admin-edit-button";
import { getEvent } from "@/lib/events";
import { eventLocationLabel, formatEventRange } from "@/lib/event-shared";
import { getSystem } from "@/lib/system";
import { getSession } from "@repo/auth/session";
import "@/components/item-detail.css";

/**
 * One event.
 *
 * Built on the same bones as the blog/story detail page (hero → breadcrumbs →
 * eyebrow → title → gallery beside the copy), with the two things a story has no
 * use for: a facts card saying *when* and *where*, and a map when the place has
 * coordinates - which it does automatically for any event held at one of the
 * tenant's own branches, since the API resolves the location across the branch.
 *
 * Purely informational, deliberately: there is no way to register, reserve or
 * pay from here. The only outward action is the tenant's own `href` (a ticket
 * page, a form, an Instagram post) if they filled one in.
 */

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const event = await getEvent(slug);
  if (!event) return {};

  const name =
    (locale === "en" ? event.en_name : event.name) ??
    event.name ??
    event.en_name ??
    slug;

  const description =
    (locale === "en" ? event.en_short_description : event.short_description) ??
    event.short_description ??
    event.en_short_description ??
    undefined;

  return {
    title: name,
    description: description ?? undefined,
    openGraph: {
      title: name,
      description: description ?? undefined,
      images: event.image ? [{ url: event.image }] : undefined,
      type: "article",
    },
  };
}

export default async function EventDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [event, t, adminT, system, session] = await Promise.all([
    getEvent(slug),
    getTranslations("Events"),
    getTranslations("Admin"),
    getSystem(),
    getSession(),
  ]);

  if (!event) notFound();

  const name =
    (locale === "en" ? event.en_name : event.name) ??
    event.name ??
    event.en_name ??
    slug;

  const shortDescription =
    (locale === "en" ? event.en_short_description : event.short_description) ??
    event.short_description ??
    event.en_short_description ??
    null;

  const description =
    (locale === "en" ? event.en_description : event.description) ??
    event.description ??
    event.en_description ??
    null;

  const when = formatEventRange(event, locale);
  const where = eventLocationLabel(event, locale);
  const latitude = event.latitude === null ? null : Number(event.latitude);
  const longitude = event.longitude === null ? null : Number(event.longitude);
  const hasCoordinates =
    latitude !== null &&
    longitude !== null &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);

  const galleryImages: GalleryImage[] = [
    ...(event.image ? [{ url: event.image, alt: name }] : []),
    ...(event.images ?? [])
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
    { label: t("heading"), href: "/events" },
    { label: name },
  ];

  const hasImage = Boolean(event.image);

  return (
    <>
      {hasImage && (
        <SectionHero
          backgroundImage={event.image}
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

        <Box alignItems="center" gap={12} flexWrap="wrap" marginBottom={8}>
          <Typography
            as="span"
            variant="label"
            color="var(--accent)"
            fontWeight={700}
            styles={{ letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            {when}
          </Typography>
          {/* Stated once, up here beside the date it qualifies - a reader who
              has followed a shared link needs to know this already happened
              before they read a word of it. */}
          {event.is_past && (
            <Badge variant="subtle" size="sm" uppercase>
              {t("past")}
            </Badge>
          )}
          {session?.isAdmin && (
            <AdminEditButton
              href={`/admin/events/${event.id}`}
              label={adminT("edit")}
              size="sm"
            />
          )}
        </Box>

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

        <Grid container spacing={2} marginTop={32}>
          {galleryImages.length > 0 && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <ItemGalleryClient
                images={galleryImages}
                placeholderColor={event.background_color ?? undefined}
              />
            </Grid>
          )}

          <Grid size={{ xs: 12, sm: galleryImages.length > 0 ? 6 : 12 }}>
            <Box flexDirection="column" gap={24}>
              {/* When and where, as a card rather than prose: they are the two
                  facts someone came for, and they must survive being skimmed. */}
              <Card gap={12}>
                <FactRow label={t("whenLabel")} value={when} />
                {event.is_all_day && (
                  <FactRow label={t("durationLabel")} value={t("allDay")} />
                )}
                {where && <FactRow label={t("whereLabel")} value={where} />}

                <Box gap={10} flexWrap="wrap" marginTop={4}>
                  {hasCoordinates && (
                    <Button
                      text={t("getDirections")}
                      size="sm"
                      kind="primary"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`}
                      target="_blank"
                    />
                  )}
                  {/* The tenant's own outward link - a ticket page, a form, a
                      post. The only action on this page, and only when they
                      filled one in. */}
                  {event.href && (
                    <Button
                      text={t("moreInfo")}
                      size="sm"
                      href={event.href}
                      target="_blank"
                    />
                  )}
                </Box>
              </Card>

              {description && (
                <Box className="item-detail__description item-detail__center-mobile">
                  <RichText>{description}</RichText>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>

        {hasCoordinates && (
          <Box flexDirection="column" gap={16} marginTop={40} width="100%">
            <Typography as="h2" variant="h2" className="section-title">
              {t("whereLabel")}
            </Typography>
            <PlaceMap
              latitude={latitude}
              longitude={longitude}
              title={name}
              pinIcon={system?.img_brandmark ?? null}
            />
          </Box>
        )}
      </Container>
    </>
  );
}

/** One `label: value` line in the facts card. */
function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" gap={2}>
      <Typography
        as="span"
        variant="label"
        fontWeight={700}
        color="var(--muted-foreground, #6b7280)"
        styles={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
      >
        {label}
      </Typography>
      <Typography variant="body" margin={0} fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}
