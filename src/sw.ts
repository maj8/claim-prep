/// <reference lib="webworker" />
// Service worker: keeps the app working offline, caches the text-recognition files the first time they
// are used, and receives files shared into the app from other apps (Android share sheet).
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { createStore, set } from 'idb-keyval';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: any };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// Text recognition engine and English language data (about 6 MB): cached on first use.
registerRoute(({ url }) => url.pathname.includes('/tess/') || url.pathname.includes('/pdfjs/'), new CacheFirst({ cacheName: 'claim-prep-ocr' }));

const inbox = createStore('claim-prep-inbox', 'inbox');
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll('files').filter((f): f is File => f instanceof File);
        await Promise.all(files.map((f, i) => set(`${Date.now()}-${i}`, f, inbox)));
      } catch { /* nothing shared */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
  }
});
