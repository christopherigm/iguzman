import type { SliderStep } from "@repo/ui/core-elements/slider";
import type { HeroLogoBackground } from "@repo/ui/hero";

/**
 * The badge shapes the frontend can render, and the whole-percent stops the two
 * size sliders offer. Shared by every CMS control that frames an image in a
 * shape: the hero's logo badge
 * (`admin/logos-and-styles/hero-video-section.tsx`) and the social flyer's
 * centred photo (`admin/social-posts/[id]/page.tsx`). One list,
 * so the CMS cannot offer a shape on one screen that the other can't draw, and
 * so neither can compose a value the API then rejects.
 */
export const LOGO_BACKGROUND_SHAPES: HeroLogoBackground[] = [
  "none",
  "circle",
  "square",
  "rounded",
  "triangle",
  "pentagon",
  "hexagon",
  "octagon",
  "logo",
];

/** Admin-namespace message key for each shape's option label. */
export const LOGO_BACKGROUND_LABEL_KEY: Record<HeroLogoBackground, string> = {
  none: "heroLogoBgNone",
  circle: "heroLogoBgCircle",
  square: "heroLogoBgSquare",
  rounded: "heroLogoBgRounded",
  triangle: "heroLogoBgTriangle",
  pentagon: "heroLogoBgPentagon",
  hexagon: "heroLogoBgHexagon",
  octagon: "heroLogoBgOctagon",
  logo: "heroLogoBgLogo",
};

/**
 * Whole-percent stops for the badge-size and image-in-badge sliders. 100 is the
 * full size; below that the target shrinks about its centre. The range matches
 * the bounds the API validates on both models.
 */
export const SCALE_STEPS: SliderStep[] = [30, 40, 50, 60, 70, 80, 90, 100].map((v) => ({
  value: v,
  label: `${v}%`,
}));
