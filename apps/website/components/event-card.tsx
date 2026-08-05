import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Badge } from "@repo/ui/core-elements/badge";
import { Button } from "@repo/ui/core-elements/button";
import type { Event } from "@/lib/events";
import {
  eventLocationLabel,
  formatEventDateShort,
  formatEventRange,
} from "@/lib/event-shared";
import { AdminEditButton } from "./admin-edit-button";

/**
 * One event as a listing card.
 *
 * Deliberately a **different shape** from `StoryCard`, which is a photo with the
 * text laid over it. An event is scanned for *when* and *where* before anything
 * else, so the date leads: a bordered date block sits at the top-left of the
 * photograph, and the body below reads date-and-time → title → place → blurb →
 * the way in. Two card designs in one landing is the point (see
 * `sites/CLAUDE.md`'s variety rule) - five identical grids stacked is the tell
 * this avoids.
 *
 * Every label arrives as a prop rather than through `useTranslations`, because
 * this renders in **both** trees: inside the client slider on a landing, and
 * directly in the server-rendered `/events` listing. `StoryCard` takes its
 * `readMore` for the same reason.
 */

export interface EventCardLabels {
  /** The button leading to the event's own page. */
  viewDetail: string;
  /** Badge on an event that has already happened. */
  past: string;
  /** Shown in place of a time on an all-day event. */
  allDay: string;
}

export function EventCard({
  event,
  locale,
  labels,
  isAdmin = false,
  editLabel,
  priority = false,
}: {
  event: Event;
  locale: string;
  labels: EventCardLabels;
  /** Show the admin edit shortcut. Only pass `true` for an admin viewer. */
  isAdmin?: boolean;
  /** Translated "Edit" label / tooltip - required when `isAdmin` is true. */
  editLabel?: string;
  /** Eager-load this card's image (the first card in a slider or grid). */
  priority?: boolean;
}) {
  const name =
    (locale === "en" ? event.en_name : event.name) ??
    event.name ??
    event.en_name ??
    "";
  const description =
    (locale === "en" ? event.en_short_description : event.short_description) ??
    event.short_description ??
    event.en_short_description ??
    "";
  const when = formatEventRange(event, locale);
  const where = eventLocationLabel(event, locale);
  const dateBlock = formatEventDateShort(event, locale);
  const hasImage = Boolean(event.image);

  const body = (
    <>
      <Box
        width="100%"
        borderRadius={6}
        backgroundColor={event.background_color ?? "var(--surface-2, #e5e7eb)"}
        styles={{
          position: "relative",
          overflow: "hidden",
          aspectRatio: "16 / 10",
          flexShrink: 0,
        }}
      >
        {hasImage && (
          <Image
            fill
            src={event.image!}
            alt={name}
            sizes="(min-width: 1200px) 30vw, (min-width: 600px) 45vw, 100vw"
            priority={priority}
            style={{ objectFit: "cover" }}
          />
        )}

        {/* The date block: the one thing that makes this an *event* card rather
            than another content card. It sits on the photograph so the card is
            scannable at a glance, and carries its own surface so it stays legible
            over an arbitrary image. */}
        <Box
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          paddingX={10}
          paddingY={6}
          borderRadius={6}
          backgroundColor="var(--background, #fff)"
          className="elevation-3"
          styles={{ position: "absolute", top: 12, left: 12, zIndex: 2 }}
        >
          <Typography
            as="span"
            variant="label"
            fontWeight={700}
            color="var(--accent)"
            styles={{ letterSpacing: "0.08em", textTransform: "uppercase" }}
          >
            {dateBlock}
          </Typography>
        </Box>

        {event.is_past && (
          <Badge
            variant="filled"
            color="rgba(0, 0, 0, 0.5)"
            textColor="#fff"
            size="sm"
            uppercase
            translucent
            style={{ position: "absolute", top: 12, right: 12, zIndex: 2 }}
          >
            {labels.past}
          </Badge>
        )}

        {/* Admin-only edit shortcut. Below the "past" badge rather than beside
            it - only one of the two is ever on a card at the same corner. */}
        {isAdmin && editLabel && (
          <Box
            styles={{
              position: "absolute",
              top: event.is_past ? 48 : 12,
              right: 12,
              zIndex: 3,
            }}
          >
            <AdminEditButton
              href={`/admin/events/${event.id}`}
              label={editLabel}
              size="sm"
              solid
            />
          </Box>
        )}
      </Box>

      {/* `flexGrow` is what gives the CTA's `marginTop: auto` something to push
          against, so the button lands on one line across a row of cards. */}
      <Box flexDirection="column" gap={8} flexGrow={1} paddingY={14} paddingX={4}>
        <Typography
          as="span"
          variant="label"
          fontWeight={600}
          color="var(--muted-foreground, #6b7280)"
        >
          {event.is_all_day ? `${when} - ${labels.allDay}` : when}
        </Typography>

        <Typography as="h3" variant="h4" margin={0} fontWeight={700}>
          {name}
        </Typography>

        {where && (
          <Typography
            variant="body"
            margin={0}
            color="var(--muted-foreground, #6b7280)"
            styles={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {where}
          </Typography>
        )}

        {description && (
          <Typography
            variant="body"
            margin={0}
            styles={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {description}
          </Typography>
        )}

        {/* Pushed to the bottom so the button lands on the same line across a
            row of cards whose blurbs differ in length. */}
        <Box marginTop="auto" paddingTop={6} alignItems="flex-start">
          <Button
            text={labels.viewDetail}
            icon="/icons/next.svg"
            iconPosition="end"
            iconSize="14px"
          />
        </Box>
      </Box>
    </>
  );

  // `Card` is already a clipped flex column, so only what differs is set here.
  // `height: 100%` is what makes a row of cards share one height inside the
  // slider, whose slides are `height: auto`.
  const surfaceProps = {
    elevation: 3,
    borderRadius: 8,
    padding: 10,
    height: "100%",
    className: "zoom-on-hover",
  } as const;

  // The whole card is the link - the Button inside it is the affordance, not a
  // second target. An event with no slug has no page to open, so it renders as a
  // plain surface (the API always assigns one, but a hand-written row may not).
  if (event.slug) {
    return (
      <Card
        href={`/events/${event.slug}`}
        prefetch
        {...surfaceProps}
        styles={{ textDecoration: "none", color: "inherit" }}
      >
        {body}
      </Card>
    );
  }

  return <Card {...surfaceProps}>{body}</Card>;
}
