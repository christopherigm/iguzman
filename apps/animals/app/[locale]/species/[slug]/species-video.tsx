import { Box } from '@repo/ui/core-elements/box';
import { HeroVideo } from '@repo/ui/hero-video';

/**
 * The species' `video_link`, in a 16:9 frame.
 *
 * `HeroVideo` is an absolutely-positioned layer meant to fill a `position:
 * relative` parent, so the frame here is what gives it a size - and the whole
 * point of routing through it rather than an `<iframe>` is that the model
 * accepts "YouTube, Vimeo or direct video URL" and react-player resolves all
 * three from one field.
 *
 * **It does not autoplay and it is not muted**, which inverts every default
 * `HeroVideo` was written for. Those defaults exist because a hero background
 * plays behind text nobody asked to interrupt; this is a piece of content
 * halfway down a page, so it waits for the reader to press play and then plays
 * with its sound. `fit="contain"` for the same reason - a hero crops to fill,
 * but here the whole frame is the thing being watched.
 */
export function SpeciesVideo({ url, title }: { url: string; title: string }) {
  return (
    <Box
      width="100%"
      borderRadius={12}
      backgroundColor="#000000"
      aria-label={title}
      styles={{ position: 'relative', overflow: 'hidden', aspectRatio: '16 / 9' }}
    >
      <HeroVideo url={url} playing={false} controls muted={false} loop={false} fit="contain" />
    </Box>
  );
}
