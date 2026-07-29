'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { Badge } from '@repo/ui/core-elements/badge';
import { Button } from '@repo/ui/core-elements/button';
import { IconButton } from '@repo/ui/core-elements/icon-button';
import 'swiper/css';
import './latest-sightings.css';

/**
 * The latest journal entries, one per slide: the encounter's own data (and the
 * species it records) beside its cover photograph.
 *
 * Each slide is laid out as a **field note** rather than a media/text split - a
 * bordered leaf of paper with an accent margin rule down its left edge, the date
 * as the entry's eyebrow above a ruled header, the photograph mounted in a mat
 * like a pasted print, and the conditions set as a dotted-leader list.
 *
 * The layout is a three-area CSS grid so the same DOM reads correctly in both
 * bands (see `latest-sightings.css`, which owns the two templates):
 *
 *     xs           sm and up
 *     header       header  media
 *     media        body    media
 *     body
 *
 * On a phone that is name → image → data, which is the order someone actually
 * reads a journal entry on a narrow screen; from `sm` up the photograph moves
 * beside the writing and spans both of its rows.
 *
 * One entry is on screen at a time, and all three controls sit in a single row
 * beneath it: the arrows flank a row of dots in the site's primary colour
 * (`--accent`), which both counts the entries and jumps to one.
 *
 * A slide is a *summary*, and it carries two ways out of it: the category badge
 * opens the branch the entry is filed under, and the button under the facts
 * opens the entry's own page. Both hrefs are built by the caller
 * (`SightingsSection`), which is the component that knows the locale.
 *
 * Every string arrives already resolved for the locale - including the date,
 * which is formatted server-side so the entry's calendar day cannot shift under
 * the visitor's timezone (the API publishes a bare `YYYY-MM-DD`, which
 * `new Date()` would read as UTC midnight).
 */

export interface SightingSlide {
  id: number;
  title: string;
  /** The entry's own page - the destination of the slide's "See detail" button. */
  href: string;
  speciesName: string | null;
  categoryName: string | null;
  /** The category's page, when the entry's species is filed under one. */
  categoryHref: string | null;
  shortDescription: string | null;
  dateLabel: string;
  locationName: string | null;
  seasonName: string | null;
  weatherName: string | null;
  /** Already formatted with its unit, e.g. `"14 °C"`. */
  temperature: string | null;
  individuals: number | null;
  image: string | null;
}

interface Props {
  slides: SightingSlide[];
  labels: {
    previous: string;
    next: string;
    /** Names the dot row itself; each dot is labelled by its entry's title. */
    pagination: string;
    species: string;
    /** Labels the date for a screen reader - the eyebrow itself is bare. */
    date: string;
    location: string;
    season: string;
    weather: string;
    temperature: string;
    individuals: string;
    /** The button under each entry, leading to its own page. */
    seeDetail: string;
  };
}

export function LatestSightings({ slides, labels }: Props) {
  const [swiper, setSwiper] = useState<SwiperType | null>(null);
  // `realIndex`, not `activeIndex`: with `loop` on, Swiper prepends duplicate
  // slides, so only the former indexes back into `slides`.
  const [activeIndex, setActiveIndex] = useState(0);

  if (slides.length === 0) return null;

  return (
    <Box width="100%" flexDirection="column" gap={20}>
      <Swiper
        className="latest-sightings__swiper"
        modules={[Keyboard]}
        onSwiper={setSwiper}
        onSlideChange={(s) => setActiveIndex(s.realIndex)}
        loop={slides.length > 1}
        slidesPerView={1}
        spaceBetween={24}
        autoHeight
        keyboard={{ enabled: true }}
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={slide.id}>
            <SightingEntry slide={slide} labels={labels} priority={i === 0} />
          </SwiperSlide>
        ))}
      </Swiper>

      {/* One control row rather than arrows floating over the slide: the entry
          is a sheet of paper now, and a button parked on top of it would read as
          part of the note. */}
      {slides.length > 1 && (
        <Box justifyContent="center" alignItems="center" gap={16} width="100%">
          <IconButton
            icon="/icons/prev.svg"
            aria-label={labels.previous}
            onClick={() => swiper?.slidePrev()}
            kind="success"
            translucent
          />

          <Box role="group" aria-label={labels.pagination} alignItems="center" gap={8}>
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                type="button"
                // Each entry's own title is a better destination than "slide 3",
                // and it is already resolved for the locale.
                aria-label={slide.title}
                aria-current={i === activeIndex}
                className={`latest-sightings__dot${
                  i === activeIndex ? ' latest-sightings__dot--active' : ''
                }`}
                // `slideToLoop` indexes the real slides; it falls through to
                // `slideTo` when the slider is not looping.
                onClick={() => swiper?.slideToLoop(i)}
              />
            ))}
          </Box>

          <IconButton
            icon="/icons/next.svg"
            aria-label={labels.next}
            onClick={() => swiper?.slideNext()}
            kind="success"
            translucent
          />
        </Box>
      )}
    </Box>
  );
}

/**
 * One journal entry as a field note. The three grid areas are assigned here and
 * the templates that place them live in the stylesheet, because they are the one
 * thing that differs between the phone and everything above it.
 */
function SightingEntry({
  slide,
  labels,
  priority,
}: {
  slide: SightingSlide;
  labels: Props['labels'];
  priority: boolean;
}) {
  // Only the facts this entry actually recorded - a journal row with no weather
  // should show no weather line rather than an empty one. The date is not among
  // them: it is the entry's eyebrow above the header rule, and repeating it here
  // would say the same thing twice.
  const facts: { label: string; value: string }[] = [
    slide.speciesName ? { label: labels.species, value: slide.speciesName } : null,
    slide.locationName ? { label: labels.location, value: slide.locationName } : null,
    slide.seasonName ? { label: labels.season, value: slide.seasonName } : null,
    slide.weatherName ? { label: labels.weather, value: slide.weatherName } : null,
    slide.temperature ? { label: labels.temperature, value: slide.temperature } : null,
    slide.individuals !== null
      ? { label: labels.individuals, value: String(slide.individuals) }
      : null,
  ].filter((fact): fact is { label: string; value: string } => fact !== null);

  return (
    <Box
      className="latest-sightings__entry"
      display="grid"
      alignItems="flex-start"
      gap={24}
      padding={22}
      // Clears the accent margin rule the stylesheet draws down the left edge.
      paddingLeft={34}
      borderRadius={14}
      border="1px solid var(--border, #e5e7eb)"
      backgroundColor="var(--surface-1, #f5f5f5)"
      elevation={1}
      styles={{ position: 'relative' }}
    >
      <Box
        flexDirection="column"
        gap={10}
        paddingBottom={14}
        styles={{
          gridArea: 'header',
          borderBottom: '1px solid var(--border, #e5e7eb)',
        }}
      >
        <Box justifyContent="space-between" alignItems="center" gap={12} flexWrap="wrap">
          {/* `as="span"`: the eyebrow is metadata on the heading below it, not a
              heading of its own, and `variant` would otherwise pick the element
              too and push a stray node into the page's outline. */}
          <Typography
            as="span"
            variant="label"
            fontWeight={700}
            color="var(--accent, #06b6d4)"
            styles={{ letterSpacing: '0.14em', textTransform: 'uppercase' }}
          >
            <span className="latest-sightings__sr-only">{`${labels.date}: `}</span>
            {slide.dateLabel}
          </Typography>

          {slide.categoryName &&
            // `Badge` has no `href` of its own, so the link is the box around it -
            // which also keeps the hit area to the pill rather than the row.
            (slide.categoryHref ? (
              <Box
                href={slide.categoryHref}
                prefetch
                className="latest-sightings__badge-link"
                color="inherit"
                styles={{ textDecoration: 'none' }}
              >
                <Badge variant="subtle" size="sm" uppercase>
                  {slide.categoryName}
                </Badge>
              </Box>
            ) : (
              <Badge variant="subtle" size="sm" uppercase>
                {slide.categoryName}
              </Badge>
            ))}
        </Box>

        <Typography as="h3" variant="h3" fontWeight={700}>
          {slide.title}
        </Typography>
      </Box>

      <SightingCover slide={slide} priority={priority} />

      <Box flexDirection="column" gap={16} styles={{ gridArea: 'body' }}>
        {slide.shortDescription && (
          // Italic prose: the author's own account of the encounter, set apart
          // from the recorded conditions below it.
          <Typography
            variant="body"
            color="var(--foreground-muted, #6b7280)"
            styles={{ fontStyle: 'italic', lineHeight: 1.65 }}
          >
            {slide.shortDescription}
          </Typography>
        )}

        <Box flexDirection="column" gap={8}>
          {facts.map((fact) => (
            <FactRow key={fact.label} label={fact.label} value={fact.value} />
          ))}
        </Box>

        {/* Under the facts rather than beside the title: the card reads top-down
            as heading → story → conditions → onward, so the button is the last
            thing in that order and lands in the same place on every slide. */}
        <Box marginTop={4} alignItems="flex-start">
          <Button
            text={labels.seeDetail}
            href={slide.href}
            size="md"
            icon="/icons/next.svg"
            iconPosition="end"
            iconSize="14px"
          />
        </Box>
      </Box>
    </Box>
  );
}

/**
 * A recorded condition, set as a dotted leader: `SPECIES ···· Odocoileus`.
 *
 * The leader is an empty flex item that grows into whatever space the label and
 * the value leave. An empty flex item's baseline is synthesised from its bottom
 * margin edge, so the row's `alignItems="baseline"` lands the dots on the text's
 * own baseline and the 2px `marginBottom` lifts them just clear of it - enough
 * that the leader does not read as an underline running between the two words.
 */
function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <Box alignItems="baseline">
      <Typography
        as="span"
        variant="label"
        fontWeight={700}
        color="var(--foreground-muted, #6b7280)"
        styles={{
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>

      <Box
        aria-hidden
        flexGrow={1}
        minWidth={20}
        marginLeft={8}
        marginRight={8}
        marginBottom={2}
        styles={{ borderBottom: '1px dotted var(--border, #e5e7eb)' }}
      />

      <Typography variant="body" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

/**
 * The photograph, mounted: a pale mat with its own hairline and shadow around a
 * 4:3 print. `alignSelf` keeps it at the top of the media area, which spans both
 * text rows from `sm` up and would otherwise stretch the mat past the print.
 */
function SightingCover({ slide, priority }: { slide: SightingSlide; priority: boolean }) {
  return (
    <Box
      width="100%"
      alignSelf="flex-start"
      padding={10}
      borderRadius={6}
      border="1px solid var(--border, #e5e7eb)"
      backgroundColor="var(--background, #fff)"
      elevation={2}
      styles={{ gridArea: 'media' }}
    >
      {slide.image ? (
        <Box
          width="100%"
          borderRadius={3}
          styles={{
            position: 'relative',
            overflow: 'hidden',
            aspectRatio: '4 / 3',
          }}
        >
          <Image
            fill
            src={slide.image}
            alt={slide.title}
            sizes="(min-width: 600px) 45vw, 100vw"
            priority={priority}
            style={{ objectFit: 'cover' }}
          />
        </Box>
      ) : (
        <Box
          width="100%"
          borderRadius={3}
          backgroundColor="var(--surface-2, #e5e7eb)"
          styles={{ aspectRatio: '4 / 3' }}
          aria-hidden
        />
      )}
    </Box>
  );
}
