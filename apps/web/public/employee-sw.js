/*
 * Service worker for the employee app.
 *
 * Deliberately narrow. It caches the application shell so the app opens without
 * a connection, and it never caches an API response: assigned work is stored in
 * IndexedDB by the app itself (see lib/offline/store.ts), where it can be scoped
 * to one user and cleared on sign-out. A cache keyed only by URL could not make
 * that distinction and would survive a user switch.
 */
const SHELL_CACHE = 'sauberwerk-employee-shell-v2';
const OFFLINE_DOCUMENT = '/mitarbeiter/offline';
const SHELL_ASSETS = [OFFLINE_DOCUMENT, '/icons/app-icon.svg', '/icons/app-icon-maskable.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // A failed precache must not leave the worker uninstalled; the fallback is
      // refreshed again on every successful visit to the offline screen.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  // Sign-out drops every cache this worker owns, alongside the app clearing IndexedDB.
  if (event.data === 'clear-caches') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never serve an authenticated document or API payload from a shared cache.
  if (url.pathname.startsWith('/auth') || url.searchParams.has('_rsc')) return;

  // Static build output is immutable and safe to serve cache-first.
  if (url.pathname.startsWith('/_next/static') || url.pathname.startsWith('/icons')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })),
    );
    return;
  }

  // Employee documents: network first. Only the dedicated offline screen is kept
  // in the cache — it renders purely from IndexedDB, so it carries no server
  // data of its own, and every cache here is dropped on sign-out and on a
  // detected user change.
  if (request.mode === 'navigate' && url.pathname.startsWith('/mitarbeiter')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && url.pathname === OFFLINE_DOCUMENT) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(OFFLINE_DOCUMENT, copy));
          }
          return response;
        })
        .catch(() => caches.match(OFFLINE_DOCUMENT).then((hit) => hit || Response.error())),
    );
  }
});
