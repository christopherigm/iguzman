import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { ScrollTo } from "@repo/ui/core-elements/scroll-to";
import { getSession } from "@repo/auth/session";
import { getBranches } from "@/lib/branches";
import { getService } from "@/lib/catalog";
import { getSystem } from "@/lib/system";
import { ItemHeroVideo } from "@/components/item-hero-video";
import { SectionHero } from "@/components/section-hero";
import { BookingForm } from "./booking-form";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

/** Anchor for the on-arrival scroll - see `ScrollTo`. */
const BOOKING_HEADING_ID = "booking-heading";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const [service, t] = await Promise.all([
    getService(slug),
    getTranslations({ locale, namespace: "Booking" }) as Promise<
      (key: string) => string
    >,
  ]);
  if (!service) return {};

  const name =
    (locale === "en" ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    slug;

  return {
    title: `${t("heading")} - ${name}`,
    // A checkout step is a dead end for a crawler and its content is a form,
    // not a page anyone should land on cold from search.
    robots: { index: false, follow: false },
  };
}

/**
 * The booking checkout for one service.
 *
 * A page rather than a modal on the detail page for the ordinary reasons a
 * checkout is a page: it is a URL a customer can come back to, share with the
 * person whose appointment it is, and reload without losing what they picked
 * (the location choice rides in the search params).
 *
 * **A service that is not bookable is a 404 here**, not a redirect back to the
 * detail page. This route only exists for services the tenant opened to
 * booking; anything else is a stale link or a guessed URL, and a 404 says so.
 */
export default async function BookingPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const [service, branches, session, system, t] = await Promise.all([
    getService(slug),
    getBranches(),
    getSession(),
    getSystem(),
    getTranslations("Booking"),
  ]);

  if (!service || !service.booking_enabled) notFound();

  const name =
    (locale === "en" ? service.en_name : service.name) ??
    service.name ??
    service.en_name ??
    slug;

  // An empty `booking_branches` means every branch, not none - see
  // `branches_for` in website-api. With no Branch rows at all the tenant is a
  // single-location business and the booking simply carries no branch.
  const bookingBranches = branches
    .filter(
      (branch) =>
        service.booking_branches.length === 0 ||
        service.booking_branches.includes(branch.id),
    )
    .map((branch) => ({
      id: branch.id,
      name:
        (locale === "en" ? branch.en_name : branch.name) ??
        branch.name ??
        branch.en_name ??
        "",
      address: branch.address ?? null,
    }));

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("services"), href: "/categories/services" },
    { label: name, href: `/services/${slug}` },
    { label: t("heading") },
  ];

  // The same hero the service's own detail page shows, so the customer keeps
  // looking at what they are booking rather than arriving at a bare form. The
  // detail page has a gallery to fall back on and this page does not, so where
  // it renders no hero at all this one drops to an image hero: the service's
  // main picture, or the first gallery image when there is no main one.
  const heroImage =
    service.image ?? service.images.find((img) => img.image)?.image ?? null;
  const hasHero = Boolean(service.video_link || heroImage);

  return (
    <>
      {service.video_link ? (
        <ItemHeroVideo
          url={service.video_link}
          title={name}
          parallax={false}
          layout={system?.hero_video_layout ?? "default"}
          logo={system?.img_logo_hero}
          logoAlt={system?.site_name ?? ""}
          logoScale={(system?.hero_logo_scale ?? 100) / 100}
          backgroundScale={(system?.hero_logo_background_scale ?? 100) / 100}
          overlayStyle={system?.hero_overlay_style ?? "bottom"}
          overlayOpacity={(system?.hero_overlay_opacity ?? 75) / 100}
          overlayExtent={system?.hero_overlay_extent ?? 50}
          shape={system?.hero_logo_background ?? "none"}
          frame={system?.hero_text_frame ?? false}
          brandmark={system?.img_brandmark}
          brandmarkAlt={system?.site_name ?? ""}
        />
      ) : (
        heroImage && (
          <SectionHero
            backgroundImage={heroImage}
            slogan={name}
            parallax={false}
            style={{ height: "clamp(220px, 30vw, 400px)" }}
          />
        )
      )}
      <Container
        size="lg"
        paddingX={10}
        marginTop={16}
        // With a hero the navbar overlays it, exactly as on the detail page, so
        // the spacer is only needed when this page starts with the breadcrumbs.
        paddingTop={hasHero ? undefined : "var(--ui-navbar-height, 57px)"}
        paddingBottom="var(--ui-page-bottom-spacing, 64px)"
      >
        <Breadcrumbs items={breadcrumbs} />
        <Typography
          as="h2"
          variant="h2"
          marginBottom={32}
          id={BOOKING_HEADING_ID}
          // The navbar is fixed and overlays whatever it is above, so the
          // heading reserves its own height as scroll padding rather than
          // arriving underneath it.
          styles={{ scrollMarginTop: "var(--ui-navbar-height, 57px)" }}
        >
          {t("heading")}
        </Typography>
        {/* Opens the page on the form, leaving the hero above it. */}
        <ScrollTo target={`#${BOOKING_HEADING_ID}`} />

        <BookingForm
          service={{
            id: service.id,
            slug: service.slug,
            name,
            price: service.price,
            currency: service.currency,
            duration: service.duration,
          }}
          branches={bookingBranches}
          fulfillmentOptions={service.booking_fulfillment_options}
          paymentOptions={service.booking_payment_options}
          depositPercent={service.booking_deposit_percent}
          // Pre-fills the contact fields for a signed-in customer. Presentation
          // only - the API takes the account off the token, and a guest booking
          // is equally valid, so nothing here decides who the booking belongs to.
          account={
            session
              ? { name: session.displayName || "", email: session.email || "" }
              : null
          }
        />
      </Container>
    </>
  );
}
