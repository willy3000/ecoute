/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative base so the same build works at a domain root or under a subpath.
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Écoute — French Listening Studio',
        short_name: 'Écoute',
        description: 'A personal French listening laboratory. Listen first. Understand naturally. Repeat until fluent.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d1420',
        theme_color: '#0d1420',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell and library metadata are precached. The audio pack is
        // deliberately left out: it is imported into IndexedDB once, and caching
        // it as well would store every recording twice.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}', 'content/library.json', 'content/audio-manifest.json'],
        globIgnores: ['**/ecoute-audio-*.zip'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
