/**
 * Reference PostCSS pipeline for `@repo/ui`.
 *
 * `@repo/ui` ships its CSS as source and is bundled by each *consumer app's*
 * PostCSS config (Next.js resolves a single config from the app root), so this
 * file does NOT run during an app build. It exists so the package is
 * self-describing and so any standalone tooling that ever processes this
 * package's CSS (Storybook, a future package build, a lint step) resolves the
 * same `@custom-media` tokens the apps do.
 *
 * `@csstools/postcss-global-data` injects the generated `@custom-media` rules
 * (see scripts/gen-breakpoints-css.ts - the ONE source of truth, which every
 * app also points at) into every CSS file *before* `postcss-custom-media`
 * resolves them - custom media are otherwise only visible within the file that
 * declares them. Together they let any CSS in this package write
 * `@media (--md)` instead of a hardcoded pixel threshold.
 */
const config = {
  plugins: {
    "@csstools/postcss-global-data": {
      files: ["./src/core-elements/breakpoints.generated.css"],
    },
    "postcss-custom-media": {},
    autoprefixer: {},
  },
};

export default config;
