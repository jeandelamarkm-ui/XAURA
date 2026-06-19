/* ============================================================================
   XAURA · sw.js  —  Service Worker (SPEC §10)
   Estrategia:
     · Precache del app-shell (cada recurso individual con try/catch para que
       un fallo aislado NO rompa la instalación).
     · install  → skipWaiting().
     · activate → limpia caches viejos + clients.claim().
     · fetch:
         - Ignora peticiones no-GET y de otros orígenes.
         - Navegación (documentos)  → network-first, fallback a cache,
           y por último a offline.html.
         - Assets estáticos del shell → cache-first con refresco en segundo
           plano (stale-while-revalidate).
   ============================================================================ */

'use strict';

const CACHE = 'xaura-v3';

/* Resuelve una ruta relativa al scope del SW (funciona en subcarpetas). */
const u = (path) => new URL(path, self.registration.scope).toString();

/* ----------------------------------------------------------------------------
   App-shell a precachear (árbol SPEC §3). Rutas relativas al scope.
   ---------------------------------------------------------------------------- */
const PRECACHE_URLS = [
  // Documentos base
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',

  // Estilos (5 css, SPEC §3)
  'css/tokens.css',
  'css/base.css',
  'css/layout.css',
  'css/components.css',
  'css/views.css',

  // Bootstrap + router
  'js/app.js',
  'js/router.js',

  // js/core
  'js/core/store.js',
  'js/core/schema.js',
  'js/core/seed.js',
  'js/core/personal.js',
  'js/core/events.js',
  'js/core/trading.js',
  'js/core/settings.js',
  'js/core/aggregations.js',
  'js/core/currency.js',
  'js/core/dates.js',
  'js/core/streak.js',
  'js/core/backup.js',

  // js/ui
  'js/ui/nav.js',
  'js/ui/header.js',
  'js/ui/sheet.js',
  'js/ui/modal.js',
  'js/ui/toast.js',
  'js/ui/charts.js',
  'js/ui/keypad.js',
  'js/ui/empty.js',
  'js/ui/fit.js',

  // js/views
  'js/views/onboarding.js',
  'js/views/dashboard.js',
  'js/views/personal.js',
  'js/views/eventos.js',
  'js/views/trading.js',
  'js/views/ajustes.js',

  // Iconografía base + manifest icons
  'assets/icon.svg',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/maskable-512.png',
  'assets/icons/apple-touch-icon-180.png'
];

const OFFLINE_URL = u('offline.html');

/* ----------------------------------------------------------------------------
   INSTALL — precache tolerante a fallos (cada recurso por separado).
   ---------------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRECACHE_URLS.map(async (path) => {
      const url = u(path);
      try {
        // cache: 'reload' evita servir desde el HTTP cache del navegador.
        const req = new Request(url, { cache: 'reload' });
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          await cache.put(url, res.clone());
        }
      } catch (err) {
        // Un recurso que falle no debe abortar la instalación.
        // (p. ej. un .png de icono aún no generado).
        // Silencioso a propósito; el resto del shell se cachea igual.
      }
    }));
    await self.skipWaiting();
  })());
});

/* ----------------------------------------------------------------------------
   ACTIVATE — limpia caches viejos y toma control inmediato.
   ---------------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    );
    // Habilita Navigation Preload si está disponible (acelera el network-first).
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch (_) {}
    }
    await self.clients.claim();
  })());
});

/* ----------------------------------------------------------------------------
   Mensajería: permite que la app fuerce la activación del SW nuevo.
   ---------------------------------------------------------------------------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ----------------------------------------------------------------------------
   Helpers de estrategia.
   ---------------------------------------------------------------------------- */

/* Network-first para navegación; cae a cache; por último, offline.html. */
async function handleNavigation(event) {
  const cache = await caches.open(CACHE);
  try {
    // 1) Respuesta de Navigation Preload, si existe.
    const preload = await event.preloadResponse;
    if (preload) {
      cache.put(event.request, preload.clone()).catch(() => {});
      return preload;
    }
    // 2) Red.
    const fresh = await fetch(event.request);
    if (fresh && fresh.ok) {
      cache.put(event.request, fresh.clone()).catch(() => {});
    }
    return fresh;
  } catch (_) {
    // 3) Sin red → cache de la propia URL, luego index.html (app-shell),
    //    y por último el fallback offline.
    const cachedSame = await cache.match(event.request);
    if (cachedSame) return cachedSame;

    const cachedIndex =
      (await cache.match(u('index.html'))) || (await cache.match(u('./')));
    if (cachedIndex) return cachedIndex;

    const offline = await cache.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Sin conexión</title>' +
      '<body style="background:#0A0A0B;color:#F5F5F7;font-family:sans-serif;' +
      'display:grid;place-items:center;height:100vh;margin:0">Sin conexión</body>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

/* Cache-first con refresco en segundo plano para assets estáticos. */
async function handleAsset(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);

  const network = fetch(event.request)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) {
        cache.put(event.request, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Sirve de cache ya; refresca en segundo plano.
    event.waitUntil(network);
    return cached;
  }

  // No estaba en cache: intenta red; si falla, da respuesta vacía controlada.
  const res = await network;
  if (res) return res;

  return new Response('', { status: 504, statusText: 'Offline' });
}

/* ----------------------------------------------------------------------------
   FETCH — enrutador principal.
   ---------------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET.
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }

  // Solo http/https (ignora chrome-extension:, data:, etc.).
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Solo mismo origen (ignora peticiones a otros orígenes: CDNs, fuentes, etc.).
  if (url.origin !== self.location.origin) return;

  // Navegación (documentos HTML).
  const isNavigation =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(handleNavigation(event));
    return;
  }

  // Resto de assets del mismo origen → cache-first.
  event.respondWith(handleAsset(event));
});
