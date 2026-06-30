import type { CSSProperties } from "react";
import type { MovieFormat } from "@/lib/catalog";
import bluray from "@/icons/blu-ray.svg";
import fourK from "@/icons/4k.svg";
import dvd from "@/icons/dvd.svg";
import playStream from "@/icons/play-stream.svg";
import "./tv-format-header.css";

// Mirrors apps/cinelog's FormatHeader. `fullColor` icons render as a real
// multi-color image; the rest are white-tinted via a CSS mask so they read on
// the colored bar.
const FORMAT_HEADER: Partial<
  Record<MovieFormat, { icon: string; background: string; fullColor?: boolean }>
> = {
  bluray: { icon: bluray, background: "#0040cb" },
  "4k": { icon: fourK, background: "#000000", fullColor: true },
  dvd: { icon: dvd, background: "#6b7280" },
  digital: { icon: playStream, background: "#c30000" },
};

// Highest-quality first (4K → Blu-ray → DVD). The first present format also
// picks the single background color. "other"/unset formats contribute nothing.
const ICON_ORDER: MovieFormat[] = ["4k", "bluray", "dvd"];

/** Format strip sat above a movie cover. Renders nothing when no icon applies. */
export function TvFormatHeader({ formats = [] }: { formats?: MovieFormat[] }) {
  const shown = ICON_ORDER.filter((fmt) => formats.includes(fmt));

  // Single background by priority: `shown` is ordered highest-quality first, so
  // its first entry picks the color. No icon → no header.
  const primary = shown[0];
  if (!primary) return null;
  const background = FORMAT_HEADER[primary]!.background;

  return (
    <div className="tv-format-header" style={{ background }}>
      {shown.map((fmt) => {
        const { icon, fullColor } = FORMAT_HEADER[fmt]!;
        return fullColor ? (
          <img key={fmt} className="tv-format-header__icon" src={icon} alt="" />
        ) : (
          <span
            key={fmt}
            className="tv-format-header__icon tv-format-header__icon--mask"
            // Quote the URL: Vite inlines these small SVGs as data URIs whose
            // path data contains commas and parens, which break an unquoted
            // url() and silently drop the mask (leaving a white square).
            style={{ "--icon": `url("${icon}")` } as CSSProperties}
          />
        );
      })}
    </div>
  );
}
