import { getTranslations, getLocale } from "next-intl/server";
import { getSession } from "@repo/auth/session";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import { Typography } from "@repo/ui/core-elements/typography";
import { getPastEvents, getUpcomingEvents } from "@/lib/events";
import { orderForSlider } from "@/lib/event-shared";
import { EventsSliderClient } from "./events-slider-client";
import { LandingSection, type LandingBlockProps } from "./landing-section";
import "./events.css";

/**
 * The landing's events band: what is coming up, then the most recent things
 * that happened.
 *
 * **Renders nothing when the tenant has no events**, so it is safe to compose
 * into any landing before the content exists - the same contract `Spotlight`
 * and `SuccessStories` follow. A site never guards it.
 *
 * The upcoming/past split is made by the API (see `_event_queryset` in
 * website-api's `core/views.py`), not here: whether an event is over depends on
 * its own timezone and, for an all-day event, on the end of its local day -
 * which is exactly the reasoning a `new Date(...) < Date.now()` in a component
 * would get wrong on the one day it matters.
 */

/**
 * How many finished events trail the upcoming ones.
 *
 * Small on purpose. Past events are here so a tenant between seasons still has
 * something to show and so the section proves a track record - not so a decade
 * of history buries the two events that are actually next. The full archive is
 * `/events`, which the "see all" button leads to.
 */
const PAST_IN_SLIDER = 3;

/** Enough upcoming events to fill the slider several times over, and no more. */
const UPCOMING_IN_SLIDER = 12;

export async function Events(section: LandingBlockProps = {}) {
  const [upcoming, past, t, adminT, locale, session] = await Promise.all([
    getUpcomingEvents(UPCOMING_IN_SLIDER),
    getPastEvents(PAST_IN_SLIDER),
    getTranslations("Events"),
    getTranslations("Admin"),
    getLocale(),
    getSession(),
  ]);

  const events = orderForSlider(upcoming, past, PAST_IN_SLIDER);
  if (events.length === 0) return null;

  // Only worth offering when the slider is not already the whole archive.
  const hasMore = upcoming.length >= UPCOMING_IN_SLIDER || past.length > 0;

  return (
    <LandingSection {...section}>
      {/* The heading group and the "see all" button sit on one line and wrap
          together on a phone. `.highlights-header` is the shared title/subtitle
          stack (it forces `flex-direction: column`, which is why it is the inner
          box rather than this row); its own `margin-bottom` is cancelled here so
          the row owns the gap to the slider. */}
      <Box
        justifyContent="space-between"
        alignItems="flex-end"
        flexWrap="wrap"
        gap={16}
        marginBottom={24}
      >
        <Box className="highlights-header" marginBottom={0}>
          <Typography as="h2" variant="h2" className="section-title">
            {t("heading")}
          </Typography>
          <Typography variant="none" className="section-subtitle">
            {upcoming.length > 0 ? t("subtitle") : t("subtitlePastOnly")}
          </Typography>
        </Box>

        {hasMore && <Button text={t("seeAll")} href="/events" />}
      </Box>

      <EventsSliderClient
        events={events}
        locale={locale}
        labels={{
          viewDetail: t("viewDetail"),
          past: t("past"),
          allDay: t("allDay"),
        }}
        isAdmin={session?.isAdmin ?? false}
        editLabel={adminT("edit")}
      />
    </LandingSection>
  );
}
