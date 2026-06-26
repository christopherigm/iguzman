import type { CSSProperties } from "react";
import { Box } from "@repo/ui/core-elements/box";
import { Icon } from "@repo/ui/core-elements/icon";
import { BREAKPOINTS, type Breakpoint } from "@repo/ui/core-elements/utils";
import type { MovieFormat } from "@/lib/catalog";
import "./format-header.css";

// Visual style for the format header rendered above the cover image.
// "other"/"" formats have no header.
// `fullColor` formats render the SVG as a real multi-color image (via the
// Icon `fullColor` prop) instead of the monochrome mask, so the badge keeps
// its own colors.
const FORMAT_HEADER: Partial<
  Record<MovieFormat, { icon: string; background: string; fullColor?: boolean }>
> = {
  bluray: { icon: "/icons/blu-ray.svg", background: "#0040cb" },
  "4k": { icon: "/icons/4k.svg", background: "#000000", fullColor: true },
  dvd: { icon: "/icons/dvd.svg", background: "#6b7280" },
  digital: { icon: "/icons/play-stream.svg", background: "#c30000" },
};

// Icons render highest-quality first (4K → Blu-ray → DVD). The list also drives
// the single background color: the first present format wins, so 4K beats
// Blu-ray beats DVD. "other"/unset formats have no icon and contribute nothing.
// "digital" is intentionally absent here: unlike the shared physical formats it
// is a per-user signal, appended only when the caller passes `showDigital` (the
// requesting user has saved their own digital-copy link), never read from the
// movie's shared `formats`.
const ICON_ORDER: MovieFormat[] = ["4k", "bluray", "dvd"];

type Size = "sm" | "md" | "lg";

// Header dimensions (px) per size. "sm" is the base; "md" is 1.2x and "lg" is
// 1.5x the bar height, with the icon scaled to match.
const SIZE_TOKENS: Record<Size, { height: number; icon: number }> = {
  sm: { height: 20, icon: 20 },
  md: { height: 24, icon: 24 },
  lg: { height: 30, icon: 30 },
};

// A single size, or a per-breakpoint map (mobile-first carry-forward).
type ResponsiveSize = Size | Partial<Record<Breakpoint, Size>>;

const BREAKPOINT_ORDER = Object.keys(BREAKPOINTS) as Breakpoint[];

type Props = {
  // The movie's formats; every one that has an icon renders inside a single
  // colored box. An empty list (or only "other"/unset formats) renders nothing.
  formats: MovieFormat[];
  // "bar" fills the top of the cover image (grid/detail/inbox); "badge" is a
  // self-sized banner rendered above the title (list). Both share contents.
  kind: "bar" | "badge";
  // Height of the strip. Pass a breakpoint map (e.g. `{ xs: "md", md: "lg" }`)
  // to scale responsively. Defaults to "sm".
  size?: ResponsiveSize;
  // Append the digital streaming icon. Per-user (the requesting user saved their
  // own digital-copy link), so it's a caller-supplied flag rather than read from
  // the movie's shared `formats`. Lets a digital-only title render a header that
  // its owner sees while everyone else sees none.
  showDigital?: boolean;
};

// Build the inline CSS variables that drive the responsive @media cascade in
// format-header.css. For every breakpoint we emit the *carried-forward* size so
// the stylesheet can read a value at each step without fallback chains.
function buildSizeVars(size: Partial<Record<Breakpoint, Size>>): CSSProperties {
  const vars: Record<string, string> = {};
  let current: Size = size.xs ?? "sm";
  for (const bp of BREAKPOINT_ORDER) {
    current = size[bp] ?? current;
    const token = SIZE_TOKENS[current];
    vars[`--fh-h-${bp}`] = `${token.height}px`;
    vars[`--fh-i-${bp}`] = `${token.icon}px`;
  }
  return vars as CSSProperties;
}

/** Format strip sat above a movie cover, or a self-sized banner in list view. */
export function FormatHeader({
  formats = [],
  kind,
  size = "sm",
  showDigital = false,
}: Props) {
  // Keep only the formats that have an icon, ordered 4K → Blu-ray → DVD.
  // `formats` is defaulted in case an upstream payload (e.g. a stale cached
  // related-movie entry) predates the field and omits it entirely.
  const physical = ICON_ORDER.filter((fmt) => formats.includes(fmt));
  // Append the per-user digital icon last so a physical format still owns the
  // background color (digital only sets it when the title is digital-only).
  const shown: MovieFormat[] = showDigital
    ? [...physical, "digital"]
    : physical;

  // Single background by priority: `shown` is ordered highest-quality first, so
  // its first entry picks the color (4K > Blu-ray > DVD > Digital). No icon → no
  // header.
  const primary = shown[0];
  if (!primary) return null;
  const background = FORMAT_HEADER[primary]!.background;

  // Static sizes resolve to plain px props; a breakpoint map switches to the
  // CSS-variable path so the @media cascade can resize the strip responsively.
  const responsive = typeof size !== "string";
  const heightValue = responsive
    ? "var(--fh-height)"
    : `${SIZE_TOKENS[size].height}px`;
  const iconValue = responsive
    ? "var(--fh-icon)"
    : `${SIZE_TOKENS[size].icon}px`;
  const sizeVars = responsive ? buildSizeVars(size) : undefined;

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      gap={12}
      height={heightValue}
      width={kind === "bar" ? "100%" : undefined}
      // A badge sizes to its icons with a little breathing room.
      paddingX={kind === "badge" ? 8 : undefined}
      borderRadius={kind === "badge" ? 4 : undefined}
      backgroundColor={background}
      className={responsive ? "format-header" : undefined}
      styles={
        kind === "badge"
          ? { alignSelf: "flex-start", width: "fit-content", ...sizeVars }
          : sizeVars
      }
    >
      {shown.map((fmt) => {
        const headerStyle = FORMAT_HEADER[fmt]!;
        return (
          <Icon
            key={fmt}
            icon={headerStyle.icon}
            color="#ffffff"
            size={iconValue}
            fullColor={headerStyle.fullColor}
          />
        );
      })}
    </Box>
  );
}
