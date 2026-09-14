/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: [
        'icons/apple-touch-icon.png',
        'icons/icon.svg',
        'brand/lsmc-logo-ink.svg',
        'preview.html',
        'prototypes/*.jsx',
      ],
      manifest: {
        name: 'Trustee Tracker',
        short_name: 'Trustee Tracker',
        description: 'Lithia Springs Methodist Trustee Tracker',
        theme_color: '#0b3f3c',
        background_color: '#faf9f6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [
          /^\/preview\.html$/,
          /^\/prototypes\//,
          /^\/icons\//,
        ],
        runtimeCaching: [
          // Microsoft Graph / login must always hit the network — never
          // serve stale list data or stale tokens from the SW cache.
          {
            urlPattern: /^https:\/\/(graph\.microsoft\.com|login\.microsoftonline\.com)/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  test: {
    globals: true,
    environment: 'node',
  },
});
