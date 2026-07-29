import { Box } from '@repo/ui/core-elements/box';
import { Typography } from '@repo/ui/core-elements/typography';
import { HeroVideo } from '@repo/ui/hero-video';

/**
 * The moving half of a sighting's gallery: every `video` and `link` media row,
 * each in a 16:9 frame with its caption.
 *
 * One component for both kinds because `source_url` has already resolved them -
 * an uploaded file and a YouTube URL arrive as the same string, and react-player
 * (behind `HeroVideo`) plays either. Photos take the other path, into the page's
 * first row through `DetailGallery`, since a slideshow is the right object for
 * them and a stack of players is the right one here.
 *
 * **Not playing, not muted**, inverting `HeroVideo`'s defaults for the same
 * reason `SpeciesVideo` does: those defaults are for a background behind text
 * nobody asked to interrupt, and this is a clip halfway down a page that waits
 * to be pressed and then plays with its sound.
 */

export interface SightingVideo {
  key: string;
  url: string;
  /** Already resolved for the current locale by the page. */
  title: string | null;
  caption: string | null;
}

export function SightingVideos({ videos }: { videos: SightingVideo[] }) {
  if (videos.length === 0) return null;

  return (
    <Box flexDirection="column" gap={24} width="100%">
      {videos.map((video) => (
        <Box key={video.key} flexDirection="column" gap={8} width="100%">
          <Box
            width="100%"
            borderRadius={12}
            backgroundColor="#000000"
            styles={{
              position: 'relative',
              overflow: 'hidden',
              aspectRatio: '16 / 9',
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

          {(video.title || video.caption) && (
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
          )}
        </Box>
      ))}
    </Box>
  );
}
