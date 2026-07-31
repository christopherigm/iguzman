'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { Box } from '@repo/ui/core-elements/box';
import { Grid, type GridSize } from '@repo/ui/core-elements/grid';
import { Typography } from '@repo/ui/core-elements/typography';
import { Spinner } from '@repo/ui/core-elements/spinner';
import { HeroVideo } from '@repo/ui/hero-video';
import { VideoProcessingNotice } from './video-processing-notice';
import './sighting-videos.css';

/**
 * The moving half of a sighting's gallery: every `video` and `link` media row,
 * each in a frame of **its own shape** with its caption.
 *
 * One component for both kinds because `source_url` has already resolved them -
 * an uploaded file and a YouTube URL arrive as the same string, and react-player
 * (behind `HeroVideo`) plays either. Photos take the other path, into the page's
 * first row through `DetailGallery`, since a slideshow is the right object for
 * them and a stack of players is the right one here.
 *
 * **Every frame carries the clip's real aspect ratio**, not a fixed 16:9. The
 * pipeline stores the transcoded output's `width`/`height` on the row, so a
 * phone's portrait clip no longer sits as a narrow strip inside a letterboxed
 * landscape box. Two consequences the layout is built around:
 *
 * - **Spans are proportional to aspect ratio**, which is what makes a row of
 *   clips come out the *same height* with no letterboxing: a column's width is
 *   its span, and `height = width / ratio`, so `span ∝ ratio` cancels the ratio
 *   out. A portrait beside a landscape lands on roughly 3/9 of the twelve
 *   columns, and a row of portraits splits evenly - which is the plain
 *   `sm: 6 / md: 4 / lg: 3` grid, arrived at by the same rule rather than by a
 *   second one.
 * - ⚠ **An all-portrait list keeps that grid even when it does not fill a row.**
 *   Proportional spans decide how a row *shares* its width, not how tall it may
 *   get, so two 9:16 clips filling one `sm` row at 6/6 come out half a page wide
 *   and nearly two pages tall. When every clip is portrait each one is therefore
 *   held to its share of the twelve (`sm: 6 / md: 4 / lg: 3`) whatever the count,
 *   leaving empty columns beside a short row rather than stretching two clips to
 *   the width of four. A mixed list keeps the plain proportional rule: a portrait
 *   there is already narrowed by the landscape it stands beside.
 * - **A single clip is not a grid.** One landscape clip is full width (the page
 *   has nothing to pair it with), and one portrait clip is handed a
 *   `frameHeight` by the page so it can stand beside the map at the map's own
 *   height instead of running a thousand pixels down the page.
 *
 * **Not playing, not muted**, inverting `HeroVideo`'s defaults for the same
 * reason `SpeciesVideo` does: those defaults are for a background behind text
 * nobody asked to interrupt, and this is a clip halfway down a page that waits
 * to be pressed and then plays with its sound.
 *
 * ⚠ **A clip still converting is a line of text, not a frame.** Only the
 * *ready* clips are laid out; the rest are counted into one spinner and one
 * sentence under the heading (`videoProcessing`, pluralised on that count),
 * because a black box the shape of a video that cannot be played reads as a
 * broken player rather than as one that is on its way. It also cannot be shaped
 * honestly: a clip in flight has no dimensions yet, so the frame would be a
 * guessed 16:9 that jumps to the real ratio when the poll lands.
 *
 * ⚠ **A failed clip never reaches this component.** `toVideos` in the page drops
 * it, so there is no "could not be converted" line here - see the note there.
 */

export interface SightingVideo {
  key: string;
  /** Null while an uploaded clip is still being converted. */
  url: string | null;
  /**
   * Where an uploaded clip is in the transcode pipeline. A link is always
   * `'ready'` - there is nothing to convert - and `'failed'` is filtered out
   * upstream, so it is not one of the states rendered here.
   */
  status: 'pending' | 'processing' | 'ready';
  /** Already resolved for the current locale by the page. */
  title: string | null;
  caption: string | null;
  /**
   * Of the transcoded output. Null for a link, which falls back to 16:9 - the
   * only shape available for a URL nothing here has probed. Also null for a
   * clip still in flight, which is why one is never given a frame: there is no
   * honest shape to draw before ffmpeg has answered.
   */
  width: number | null;
  height: number | null;
}

interface Props {
  videos: SightingVideo[];
  /**
   * Pins the frame to this height in pixels from `sm` up, its width following
   * from the clip's own aspect ratio; below `sm` the clip is full width as
   * everywhere else. Passed by the page for a lone portrait clip - both the one
   * standing beside the map (same height as the map) and the one on an entry
   * with no coordinates - and it only ever applies to the first clip, since the
   * page hands this over for a single-clip entry.
   */
  frameHeight?: number;
}

/** How many clips share a row, per breakpoint. `xs` is always one. */
const PER_ROW = { sm: 2, md: 3, lg: 4 } as const;

/** Narrowest column a clip may be given - below this a player has no controls. */
const MIN_SPAN = 2;

/** The shape assumed for a clip whose real dimensions are not known yet. */
const FALLBACK_ASPECT = 16 / 9;

/**
 * A clip that has something to play. The narrowing is what lets everything
 * below take `url` as a string rather than re-checking a state the filter has
 * already decided.
 */
type ReadyVideo = SightingVideo & { url: string };

export function SightingVideos({ videos, frameHeight }: Props) {
  if (videos.length === 0) return null;

  // The only rows that get a frame. The rest are still being converted: they
  // have no file to play and no dimensions to shape a box with, so they are
  // counted into one line of text above instead.
  const ready = videos.filter(
    (video): video is ReadyVideo =>
      Boolean(video.url) && video.status === 'ready',
  );
  const converting = videos.length - ready.length;

  const solo = ready[0];

  return (
    <Box flexDirection="column" gap={24} width="100%">
      <ConvertingNotice count={converting} />

      {/* `frameHeight` only ever arrives for a lone portrait clip, which is by
          definition ready - the page needs its dimensions to know it is
          portrait at all - so the pinned-height layout is the single-ready-clip
          case, not the single-row case. */}
      {frameHeight && solo && ready.length === 1 ? (
        <SoloVideo video={solo} frameHeight={frameHeight} />
      ) : (
        ready.length > 0 && <VideoGrid videos={ready} />
      )}
    </Box>
  );
}

/**
 * The clips still in the pipeline, as one spinner and one sentence rather than
 * one dead frame each - see the note at the top of the file.
 *
 * `VideoProcessingNotice` rides along: it polls from the client and refreshes
 * the route, so the count falls as each clip lands and this whole row unmounts
 * with the last one.
 */
function ConvertingNotice({ count }: { count: number }) {
  const t = useTranslations('SightingPage');

  if (count === 0) return null;

  return (
    <Box alignItems="center" gap={12}>
      {/* A flex item's `min-width` is `auto`, which for an empty span is zero -
          so without this the disc is squashed to a sliver by a sentence that
          wraps to two lines on a phone. */}
      <Spinner size={20} styles={{ flexShrink: 0 }} />
      <Typography variant="body" color="var(--foreground-muted, #6b7280)">
        {t('videoProcessing', { count })}
      </Typography>
      <VideoProcessingNotice />
    </Box>
  );
}

/**
 * A lone portrait clip, cut to the height the page hands it (the map's, so the
 * two stand level in one row) with its width following from its aspect ratio.
 */
function SoloVideo({
  video,
  frameHeight,
}: {
  video: ReadyVideo;
  frameHeight: number;
}) {
  // The one rule props cannot express: a width that only applies from `sm`
  // up. The pixel value is per-clip, so it travels as a custom property and
  // `sighting-videos.css` holds nothing but the media query that reads it.
  const soloStyle = {
    '--sv-solo-width': `${Math.round(frameHeight * aspectRatio(video))}px`,
  } as Record<string, string> as CSSProperties;

  // ⚠ No `width` prop: its parent is a column flex container, which already
  // stretches this to full width below `sm`, and an inline `width: 100%`
  // would beat the media query that narrows it from `sm` up.
  return (
    <Box className="sv__solo" flexDirection="column" gap={8} styles={soloStyle}>
      <VideoFrame video={video} />
      <VideoCaption video={video} />
    </Box>
  );
}

function VideoGrid({ videos }: { videos: ReadyVideo[] }) {
  const sizes = videoSizes(videos);

  return (
    <Grid container spacing={2}>
      {videos.map((video, index) => (
        <Grid key={video.key} size={sizes[index] ?? { xs: 12 }}>
          <Box flexDirection="column" gap={8} width="100%">
            <VideoFrame video={video} />
            <VideoCaption video={video} />
          </Box>
        </Grid>
      ))}
    </Grid>
  );
}

/** One clip in its own frame. Only ever rendered for a clip that is ready. */
function VideoFrame({ video }: { video: ReadyVideo }) {
  return (
    <Box
      width="100%"
      borderRadius={8}
      backgroundColor="#000000"
      styles={{
        position: 'relative',
        overflow: 'hidden',
        // The clip's own shape, so the frame *is* the video rather than a box
        // the video is letterboxed into.
        aspectRatio: aspectRatio(video).toString(),
      }}
    >
      <HeroVideo
        url={video.url}
        playing={false}
        controls
        muted={false}
        loop={false}
        fit="contain"
      />
    </Box>
  );
}

function VideoCaption({ video }: { video: SightingVideo }) {
  if (!video.title && !video.caption) return null;

  return (
    <Box flexDirection="column" gap={2}>
      {video.title && (
        <Typography variant="body" fontWeight={600}>
          {video.title}
        </Typography>
      )}
      {video.caption && (
        <Typography variant="caption" color="var(--foreground-muted, #6b7280)">
          {video.caption}
        </Typography>
      )}
    </Box>
  );
}

/** Width ÷ height of the transcoded output, or 16:9 when it is not known. */
function aspectRatio(video: SightingVideo): number {
  if (!video.width || !video.height) return FALLBACK_ASPECT;
  return video.width / video.height;
}

/**
 * Each clip's column span, per breakpoint.
 *
 * The list is cut into rows of `PER_ROW[bp]` clips and each row's twelve columns
 * are handed out in proportion to the clips' aspect ratios, which leaves every
 * clip in the row the same height (see the note at the top of the file).
 *
 * A **short** row - one with fewer clips than the breakpoint fits - normally gets
 * only its share of the twelve, so the fifth clip under a row of four keeps that
 * row's width instead of suddenly spanning the page. A list that fits in one row
 * is the exception and takes all twelve: two landscape clips at `lg` are two
 * clips, not the first half of a row of four.
 *
 * ⚠ **That exception is off for an all-portrait list**, where filling the row is
 * exactly what makes the clips too tall - see the note at the top of the file. So
 * every row is short-changed there, and two portraits come out at `sm: 6 /
 * md: 4 / lg: 3` rather than at 6 the whole way up.
 *
 * A single clip skips all of it: it is full width, which is what the page wants
 * for the only shape that reaches here alone (landscape, or one still encoding).
 */
function videoSizes(videos: SightingVideo[]): GridSize[] {
  if (videos.length === 1) return [{ xs: 12 }];

  const sizes: GridSize[] = videos.map(() => ({ xs: 12 }));
  const allPortrait = videos.every((video) => aspectRatio(video) < 1);

  for (const breakpoint of ['sm', 'md', 'lg'] as const) {
    const perRow = PER_ROW[breakpoint];

    for (let start = 0; start < videos.length; start += perRow) {
      const row = videos.slice(start, start + perRow);
      const short =
        row.length < perRow && (allPortrait || videos.length > perRow);
      const columns = short ? Math.round((12 * row.length) / perRow) : 12;
      const spans = distribute(row.map(aspectRatio), columns);
      spans.forEach((span, index) => {
        sizes[start + index]![breakpoint] = span;
      });
    }
  }

  return sizes;
}

/**
 * Hands out `columns` whole columns in proportion to `aspects`, keeping every
 * span between `MIN_SPAN` and 12. Rounding rarely lands on the total exactly, so
 * the drift is walked off one column at a time - taken from (or given to) the
 * widest clip, which is where a single column shows least.
 */
function distribute(aspects: number[], columns: number): number[] {
  const total = aspects.reduce((sum, aspect) => sum + aspect, 0);
  const spans = aspects.map((aspect) =>
    Math.min(12, Math.max(MIN_SPAN, Math.round((aspect / total) * columns))),
  );

  let drift = columns - spans.reduce((sum, span) => sum + span, 0);

  while (drift !== 0) {
    const step = drift > 0 ? 1 : -1;
    let widest = -1;

    spans.forEach((span, index) => {
      const room = step > 0 ? span < 12 : span > MIN_SPAN;
      if (room && (widest === -1 || span > spans[widest]!)) widest = index;
    });

    // Every clip is already at a bound - the row simply cannot add up to
    // `columns`, and a slightly wide (or narrow) row beats an endless loop.
    if (widest === -1) break;

    spans[widest]! += step;
    drift -= step;
  }

  return spans;
}
