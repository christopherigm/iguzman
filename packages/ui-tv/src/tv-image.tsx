import { useState } from 'react';
import type { ReactNode } from 'react';
import './tv-image.css';

export interface TvImageProps {
  /** Image URL. A falsy value renders the `placeholder` instead. */
  src?: string;
  /** Alt text. Defaults to "" (decorative) - set it for meaningful images. */
  alt?: string;
  /**
   * Aspect ratio as width / height (e.g. `2 / 3` for a movie poster, `16 / 9`
   * for a backdrop). When set, the box reserves its own height from its width
   * via the padding-top hack, so it works on TV browsers without CSS
   * `aspect-ratio` (Tizen 6.x / Chromium <88). Omit to fill a parent that is
   * already sized (the parent must give this box a height).
   */
  ratio?: number;
  /** `object-fit` of the image. Defaults to `cover`. */
  fit?: 'cover' | 'contain';
  /** Shown when there is no `src` or the image fails to load. */
  placeholder?: ReactNode;
  /** Extra class on the wrapper (e.g. for border-radius). */
  className?: string;
}

/**
 * Old-Tizen-safe image box for Smart TV apps.
 *
 * Real Tizen TVs run an old Chromium (76-85 on Tizen 6.x) that silently ignores
 * modern CSS such as `aspect-ratio` and the `inset` shorthand, which collapses
 * an absolutely-positioned image to zero height - the image loads but never
 * shows. `TvImage` sidesteps that with only broadly-supported CSS: a
 * `padding-top` aspect-ratio hack and explicit `top`/`left` offsets. Prefer it
 * over a bare `<img>` in every `@repo/ui-tv` consumer so images render the same
 * on the device as in the emulator.
 *
 * It also swaps in `placeholder` when there is no `src` or the load fails.
 */
export function TvImage({
  src,
  alt = '',
  ratio,
  fit = 'cover',
  placeholder,
  className,
}: TvImageProps) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(src) && !errored;

  const cls = ['tv-image', ratio ? '' : 'tv-image--fill', className]
    .filter(Boolean)
    .join(' ');

  // The only dynamic style: reserve the aspect ratio as bottom padding
  // (padding-top is a percentage of WIDTH, so height/width*100 = 100/ratio).
  const style = ratio ? { paddingTop: `${100 / ratio}%` } : undefined;

  const imgCls = ['tv-image__img', fit === 'contain' ? 'tv-image__img--contain' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} style={style}>
      {showImage ? (
        // `src` is a string here (showImage requires it truthy).
        <img className={imgCls} src={src} alt={alt} onError={() => setErrored(true)} />
      ) : (
        placeholder != null && <div className="tv-image__placeholder">{placeholder}</div>
      )}
    </div>
  );
}
