import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Tizen runs the packaged .wgt from the widget's local filesystem (an opaque,
// file://-like origin). ES-module scripts are fetched with CORS semantics, so a
// `<script type="module" crossorigin>` entry is blocked there and never executes
// - React never mounts and only the static HTML renders. This plugin rewrites the
// entry into a classic <script>, which loads fine from the filesystem. Pair it
// with an IIFE bundle (see build.rollupOptions.output.format) so the body has no
// module syntax.
function tizenClassicScript(): Plugin {
  return {
    name: 'tizen-classic-script',
    // Build-only: the dev server serves source as ES modules (Vite's own
    // react-refresh preamble and client are module scripts too), so rewriting
    // them to classic scripts there throws a SyntaxError on `import` and the
    // app never mounts - a blank screen in the browser. The rewrite is only
    // correct against the IIFE production bundle that the .wgt ships.
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      // `defer` preserves the module script's implicit "run after DOM parsed"
      // timing - a plain head script would run before #root exists and throw.
      handler: (html) =>
        html
          .replace(/<script type="module"/g, '<script defer')
          .replace(/\s+crossorigin/g, ''),
    },
  };
}

// base: './' keeps asset URLs relative so the packaged .wgt loads from the TV
// filesystem. target es2015 stays safe across older Tizen webviews.
export default defineConfig({
  base: './',
  plugins: [react(), tizenClassicScript()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 4180, host: true },
  build: {
    outDir: 'dist',
    target: 'es2015',
    // No module preload links (they assume a module entry).
    modulePreload: false,
    // Single self-contained classic bundle - no module imports between chunks.
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
