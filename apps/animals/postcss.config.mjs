/**
 * Custom PostCSS pipeline for this app.
 *
 * Defining this file opts the app out of Next.js's built-in PostCSS defaults, so
 * every transform we rely on is listed explicitly (including `autoprefixer`,
 * which Next would otherwise apply for us).
 *
 * `@csstools/postcss-global-data` injects the generated `@custom-media` rules
 * into every CSS file *before* `postcss-custom-media` resolves them - custom
 * media are otherwise only visible within the file that declares them. Together
 * they let any CSS in this app (and any CSS `@repo/ui` contributes to the
 * bundle) write `@media (--below-sm)` instead of a hardcoded pixel threshold.
 *
 * This file is REQUIRED, not optional: `@repo/ui`'s own stylesheets (badge.css,
 * navbar.css, ...) use `@media (--below-sm)` and are compiled by *this* app's
 * config, so without it the build fails on the first `@repo/ui` CSS import.
 *
 * The tokens are generated ONCE, in `@repo/ui`
 * (`packages/ui/scripts/gen-breakpoints-css.ts` →
 * `packages/ui/src/core-elements/breakpoints.generated.css`), from the
 * single-source-of-truth `BREAKPOINTS` scale. This app points at that shared
 * file rather than keeping its own copy; regenerate with
 * `pnpm --filter @repo/ui gen:breakpoints` (wired into predev/prebuild here).
 *
 * Plugins are declared by name (object form) so this config works under both
 * dev (Turbopack) and `next build --webpack`, which read the same file.
 */
const config = {
  plugins: {
    "@csstools/postcss-global-data": {
      files: ["../../packages/ui/src/core-elements/breakpoints.generated.css"],
    },
    "postcss-custom-media": {},
    autoprefixer: {},
  },
};

export default config;
