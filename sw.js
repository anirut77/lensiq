/* sw.js — LENSIQ service worker: offline cache for the large on-device models and runtimes under vendor/.
 *
 * - Cache-first for same-origin GET requests under vendor/ (models *.onnx *.task *.bin *.json shards, wasm runtimes,
 *   face-api.js, pdf.js, ...). First visit downloads them once; afterwards they load from the cache, also offline.
 * - Everything else (pages, page scripts, /api/*) is NOT intercepted, so code updates are never served stale.
 * - Versioned: bump VERSION when a file under vendor/ changes in place; old "lq-models-*" caches are deleted on activate.
 * - Range requests and non-200 responses are never cached.
 * Registered by nav.js on secure origins (https / localhost); ?nosw disables registration for a page load.
 */
"use strict";
const VERSION = "v1";
const CACHE = "lq-models-" + VERSION;
const scopePath = new URL(self.registration ? self.registration.scope : self.location.href).pathname;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("lq-models-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isModel(req) {
  if (req.method !== "GET" || req.headers.has("range")) return false;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return false;
  return u.pathname.startsWith(scopePath + "vendor/");
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (!isModel(req)) return; // network as usual
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === "basic") {
      cache.put(req, res.clone()).catch(() => { /* quota full: still serve from network */ });
    }
    return res;
  })());
});

// pages can ask: navigator.serviceWorker.controller.postMessage({type: "lq-models-clear"})
self.addEventListener("message", event => {
  const d = event.data || {};
  if (d.type === "lq-models-clear") event.waitUntil(caches.delete(CACHE));
});
