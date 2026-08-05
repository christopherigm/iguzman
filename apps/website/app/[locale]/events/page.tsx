import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { Box } from "@repo/ui/core-elements/box";
import { Container } from "@repo/ui/core-elements/container";
import { Typography } from "@repo/ui/core-elements/typography";
import { Breadcrumbs } from "@repo/ui/core-elements/breadcrumbs";
import type { BreadcrumbItem } from "@repo/ui/core-elements/breadcrumbs";
import { Grid } from "@repo/ui/core-elements/grid";
import { SectionHero } from "@/components/section-hero";
import { EventCard, type EventCardLabels } from "@/components/event-card";
import { getPastEvents, getUpcomingEvents, type Event } from "@/lib/events";

/**
 * The full events archive: everything upcoming, then everything that happened.
 *
 * Two headed groups rather than one long list, because "is this still to come?"
 * is the only question a reader brings to this page and a single chronological
 * run answers it only by making them read every date. The cards carry their own
 * "past" badge as well - the heading is the structure, the badge is what
 * survives being linked to or scrolled past.
 *
 * The split itself is the API's (`?scope=`), not this page's: whether an event
 * is over depends on its own timezone and on the end of its local day for an
 * all-day one.
 */

type Props = {
  params: Promise<{ locale: string }>;
};

// A cap rather than a pager. An events archive is small by nature, and a tenant
// that ever outgrows this needs paging on both groups plus a "load more" - which
// is a feature, not a constant. The two together stay well inside the API's own
// `MAX_EVENT_LIMIT`.
const MAX_UPCOMING = 60;
const MAX_PAST = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = (await getTranslations({
    locale,
    namespace: "Events",
  })) as (key: string) => string;

  return {
    title: t("heading"),
    description: t("subtitle"),
  };
}

export default async function EventsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [upcoming, past, t, adminT, session] = await Promise.all([
    getUpcomingEvents(MAX_UPCOMING),
    getPastEvents(MAX_PAST),
    getTranslations("Events"),
    getTranslations("Admin"),
    getSession(),
  ]);

  const breadcrumbs: BreadcrumbItem[] = [
    { label: t("home"), href: "/" },
    { label: t("heading") },
  ];

  const labels: EventCardLabels = {
    viewDetail: t("viewDetail"),
    past: t("past"),
    allDay: t("allDay"),
  };

  // The hero borrows the next event's photograph - the same trick the highlights
  // page uses, and here it is not even a guess: the soonest upcoming event is
  // exactly what this page is about. Falls back to the most recent past one.
  const heroImage = upcoming.find((e) => e.image)?.image ??
    past.find((e) => e.image)?.image ??
    null;

  const isEmpty = upcoming.length === 0 && past.length === 0;

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
        <Typography as="h1" variant="h1" marginBottom={8}>
          {t("heading")}
        </Typography>
        <Typography variant="body" className="section-subtitle" marginBottom={32}>
          {t("subtitle")}
        </Typography>

        {isEmpty && <Typography variant="body">{t("empty")}</Typography>}

        <EventGroup
          title={t("upcomingHeading")}
          events={upcoming}
          locale={locale}
          labels={labels}
          isAdmin={session?.isAdmin ?? false}
          editLabel={adminT("edit")}
          priorityFirst
        />

        <EventGroup
          title={t("pastHeading")}
          events={past}
          locale={locale}
          labels={labels}
          isAdmin={session?.isAdmin ?? false}
          editLabel={adminT("edit")}
        />
      </Container>
    </>
  );
}

/** One headed group of event cards. Renders nothing when the group is empty. */
function EventGroup({
  title,
  events,
  locale,
  labels,
  isAdmin,
  editLabel,
  priorityFirst = false,
}: {
  title: string;
  events: Event[];
  locale: string;
  labels: EventCardLabels;
  isAdmin: boolean;
  editLabel: string;
  priorityFirst?: boolean;
}) {
  if (events.length === 0) return null;

  return (
    <Box flexDirection="column" gap={20} marginBottom={48} width="100%">
      <Typography as="h2" variant="h2" className="section-title">
        {title}
      </Typography>
      <Grid container spacing={2}>
        {events.map((event, i) => (
          // Two-up from `sm`, three from `lg` - the same rhythm the slider uses
          // at those widths, so the page and the landing band read as one set.
          <Grid key={event.id} size={{ xs: 12, sm: 6, lg: 4 }}>
            <EventCard
              event={event}
              locale={locale}
              labels={labels}
              isAdmin={isAdmin}
              editLabel={editLabel}
              priority={priorityFirst && i === 0}
            />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
