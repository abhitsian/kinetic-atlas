/* Kinetic Atlas service worker.

   The point of offline here is specific: gyms have poor signal, and the
   4.8 MB anatomy model plus the exercise library must already be on the
   device before you start a session. Both are precached on install.

   Exercise photographs come from raw.githubusercontent.com and are cached
   as you view them, so anything you have opened before stays available.
*/

const VERSION = 'ka-v1';
const SHELL = `${VERSION}-shell`;
const PHOTOS = `${VERSION}-photos`;

/* everything the app needs to boot and run a session with no network */
const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './plan.js',
  './manifest.webmanifest',
  './data/exercises.json',
  './data/muscle_group_map.json',
  './data/anatomy.glb',
  './data/head.glb',
  './vendor/three.module.js',
  './vendor/OrbitControls.js',
  './vendor/GLTFLoader.js',
  './vendor/DRACOLoader.js',
  './vendor/BufferGeometryUtils.js',
  './vendor/draco/draco_wasm_wrapper.js',
  './vendor/draco/draco_decoder.wasm',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    /* one failure should not abandon the whole install */
    await Promise.all(PRECACHE.map(url =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* exercise photos: cache them the first time they are seen */
  if (url.hostname === 'raw.githubusercontent.com') {
    e.respondWith((async () => {
      const cache = await caches.open(PHOTOS);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return hit || Response.error();
      }
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  /* app shell and data: cache first, since none of it changes mid-session */
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) {
      /* refresh in the background so the next load is current */
      fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const shell = await cache.match('./index.html');
      if (req.mode === 'navigate' && shell) return shell;
      return Response.error();
    }
  })());
});
