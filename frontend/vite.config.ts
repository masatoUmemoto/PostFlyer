import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon-16.png',
        'icons/icon-32.png',
        'icons/icon-64.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'PostFlyers Tracker',
        short_name: 'PostFlyers',
        description: 'Anonymous location sessions visualised on a shared map.',
        start_url: '/',
        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
        orientation: 'portrait-primary',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          {
            name: 'Start live session',
            short_name: 'Live session',
            description: 'Open the controls to start sharing your location',
            url: '/?panel=controls',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'View shared map',
            short_name: 'Shared map',
            description: 'Jump straight to the shared PostFlyers map',
            url: '/?view=map',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
        screenshots: [
          {
            src: 'screenshots/postflyers-mobile.png',
            sizes: '750x1334',
            type: 'image/png',
            form_factor: 'narrow',
          },
          {
            src: 'screenshots/postflyers-desktop.png',
            sizes: '1440x900',
            type: 'image/png',
            form_factor: 'wide',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin }) => sameOrigin,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'app-shell',
              expiration: { maxEntries: 50 },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
