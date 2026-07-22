/**
 * Custom PostCSS pipeline for the website app.
 *
 * Defining this file opts the app out of Next.js's built-in PostCSS defaults, so
 * every transform we rely on is listed explicitly (including `autoprefixer`,
 * which Next would otherwise apply for us).
 *
 * `@csstools/postcss-global-data` injects the generated `@custom-media` rules
 * (see scripts/gen-breakpoints-css.ts) into every CSS file *before*
 * `postcss-custom-media` resolves them - custom media are otherwise only visible
 * within the file that declares them. Together they let any CSS in this app
 * write `@media (--below-sm)` instead of a hardcoded pixel threshold.
 *
 * Plugins are declared by name (object form) so this config works under both
 * dev (Turbopack) and `next build --webpack`, which read the same file.
 */
const config = {
  plugins: {
    "@csstools/postcss-global-data": {
      files: ["./app/breakpoints.generated.css"],
    },
    "postcss-custom-media": {},
    autoprefixer: {},
  },
};

export default config;
