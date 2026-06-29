import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// base: './' keeps asset URLs relative so the packaged .wgt loads from the TV
// filesystem. target es2015 stays safe across older Tizen webviews.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 4180, host: true },
  build: { outDir: 'dist', target: 'es2015' },
});
