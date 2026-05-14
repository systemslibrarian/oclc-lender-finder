import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// Serves a normal `web/public/` directory. Data files (lvis-policies.json
// etc.) live at the repo root; web/public/ holds symlinks to them so they
// stay in one place during the migration. See web/README.md.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Use the existing repo manifest definition.
      manifest: {
        name: 'Lender Finder',
        short_name: 'Lender Finder',
        description: 'Faceted search to identify and discover ILL lender libraries.',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#185fa5',
        background_color: '#ffffff',
        icons: [
          {
            src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect width='192' height='192' rx='36' fill='%23185fa5'/><text x='96' y='132' font-size='108' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='600'>L</text></svg>",
            sizes: '192x192',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><rect width='512' height='512' rx='96' fill='%23185fa5'/><text x='256' y='352' font-size='288' text-anchor='middle' fill='white' font-family='system-ui,sans-serif' font-weight='600'>L</text></svg>",
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,webmanifest}'],
        // Treat the policy JSONs as cache-first so the app feels instant
        // offline, but revalidate in the background.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /-(policies|directory)\.json$/.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lender-finder-data',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
