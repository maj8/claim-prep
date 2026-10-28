import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync('./package.json', 'utf8')).version;

// base './' so the same build works at any address: GitHub Pages (/claim-prep/) or a folder on merra.org.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
  plugins: [
    preact(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        globIgnores: ['tess/**', 'pdfjs/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Claim Prep',
        short_name: 'Claim Prep',
        description: 'Photograph receipts, code them to your accounts and projects, and send them to Oracle.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f4ef',
        theme_color: '#0f4c5c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Android: Share → Claim Prep from email, Files or Downloads.
        share_target: {
          action: './share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', files: [{ name: 'files', accept: ['image/*', 'application/pdf', '.pdf', '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] }] },
        },
      } as any,
    }),
  ],
});
