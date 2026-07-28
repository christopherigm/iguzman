'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Keyboard } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import { Box } from '@repo/ui/core-elements/box';
import { Grid } from '@repo/ui/core-elements/grid';
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
 * One entry is on screen at a time: the arrows sit in the slider's own gutters
 * and a row of dots below it, in the site's primary colour (`--accent`), both
 * counts the entries and jumps to one.
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
    <Box width="100%" flexDirection="column" gap={16}>
      {/* The arrows are pinned to *this* box, not the outer column - anchoring
          them at `top: 50%` of a column that also holds the dot row would push
          them below the slide's own centre. */}
      <Box width="100%" styles={{ position: 'relative' }}>
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
              {/* Two-up from `sm`, not `md`: stacking a media/text pairing across
                  the whole tablet band wastes the width (see apps/CLAUDE.md). */}
              <Grid container spacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <SightingDetails slide={slide} labels={labels} />
                </Grid>

                <Grid size={{ xs: 12, sm: 6 }}>
                  <SightingCover slide={slide} priority={i === 0} />
                </Grid>
              </Grid>
            </SwiperSlide>
          ))}
        </Swiper>

        {slides.length > 1 && (
          <>
            <IconButton
              icon="/icons/prev.svg"
              aria-label={labels.previous}
              styles={{
                position: 'absolute',
                left: -4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
              }}
              onClick={() => swiper?.slidePrev()}
              kind="success"
              translucent
            />
            <IconButton
              icon="/icons/next.svg"
              aria-label={labels.next}
              styles={{
                position: 'absolute',
                right: -4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
              }}
              onClick={() => swiper?.slideNext()}
              kind="success"
              translucent
            />
          </>
        )}
      </Box>

      {slides.length > 1 && (
        <Box
          role="group"
          aria-label={labels.pagination}
          justifyContent="center"
          alignItems="center"
          gap={8}
          width="100%"
        >
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
      )}
    </Box>
  );
}

function SightingDetails({ slide, labels }: { slide: SightingSlide; labels: Props['labels'] }) {
  // Only the facts this entry actually recorded - a journal row with no weather
  // should show no weather line rather than an empty one.
  const facts: { label: string; value: string }[] = [
    { label: labels.date, value: slide.dateLabel },
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
    <Box flexDirection="column" gap={12} justifyContent="center" height="100%" paddingY={8}>
      {slide.categoryName && (
        <Box>
          {/* `Badge` has no `href` of its own, so the link is the box around it -
              which also keeps the hit area to the pill rather than the row. */}
          {slide.categoryHref ? (
            <Box
              href={slide.categoryHref}
              prefetch
              className="latest-sightings__badge-link"
              alignSelf="flex-start"
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
          )}
        </Box>
      )}

      <Typography as="h3" variant="h3" fontWeight={700}>
        {slide.title}
      </Typography>

      {slide.shortDescription && (
        <Typography variant="body" color="var(--foreground-muted, #6b7280)">
          {slide.shortDescription}
        </Typography>
      )}

      <Box flexDirection="column" gap={6} marginTop={4}>
        {facts.map((fact) => (
          <Box key={fact.label} gap={8} alignItems="baseline" flexWrap="wrap">
            <Typography
              variant="label"
              fontWeight={700}
              color="var(--foreground-muted, #6b7280)"
              styles={{ letterSpacing: '0.06em', textTransform: 'uppercase', minWidth: 96 }}
            >
              {fact.label}
            </Typography>
            <Typography variant="body">{fact.value}</Typography>
          </Box>
        ))}
      </Box>

      {/* Under the facts rather than beside the title: the card reads top-down
          as heading → story → conditions → onward, so the button is the last
          thing in that order and lands in the same place on every slide. */}
      <Box marginTop={4} alignItems="flex-start">
        <Button text={labels.seeDetail} href={slide.href} size="md" />
      </Box>
    </Box>
  );
}

function SightingCover({ slide, priority }: { slide: SightingSlide; priority: boolean }) {
  if (!slide.image) {
    return (
      <Box
        width="100%"
        borderRadius={12}
        backgroundColor="var(--surface-1, #e5e7eb)"
        styles={{ aspectRatio: '4 / 3' }}
        aria-hidden
      />
    );
  }

  return (
    <Box
      width="100%"
      borderRadius={12}
      styles={{ position: 'relative', overflow: 'hidden', aspectRatio: '4 / 3' }}
    >
      <Image
        fill
        src={slide.image}
        alt={slide.title}
        sizes="(min-width: 600px) 50vw, 100vw"
        priority={priority}
        style={{ objectFit: 'cover' }}
      />
    </Box>
  );
}
