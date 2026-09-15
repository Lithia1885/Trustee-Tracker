/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No PWA plugin. The service worker is written by hand in src/sw/sw.js
// and stamped into dist by scripts/stampServiceWorker.mjs after the
// build — see docs/updates.md. The generated worker this replaces
// served index.html from its precache and reloaded the page the moment
// a new build landed, which are the two behaviours the update flow
// exists to prevent.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'node',
  },
});
