/**
 * The responsive breakpoint scale - the single source of truth for every
 * breakpoint threshold in the monorepo.
 *
 * Consumed in two forms:
 * - **TS/TSX**: `import { BREAKPOINTS, type Breakpoint } from "@repo/ui/core-elements/breakpoints"`
 *   (also re-exported from `./utils` for backwards compatibility).
 * - **CSS**: `@custom-media` rules are generated from these values (see
 *   `packages/ui/scripts/gen-breakpoints-css.ts` →
 *   `src/core-elements/breakpoints.generated.css`, the ONE generated file every
 *   app's `postcss.config.mjs` points at) so `@media` queries never hardcode a
 *   pixel threshold.
 *
 * This module is deliberately **React-free** (no `import react`) so plain Node
 * build scripts - the CSS generator among them - can import it directly.
 */

/**
 * Breakpoint keys for the responsive grid system.
 */
export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Breakpoint minimum-width values in pixels (mobile-first).
 */
export const BREAKPOINTS: Record<Breakpoint, number> = {
  xs: 0,
  sm: 600,
  md: 900,
  lg: 1200,
  xl: 1536,
};
