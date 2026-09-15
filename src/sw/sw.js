/*
 * Trustee Tracker service worker.
 *
 * Hand-written rather than generated. The generated worker this
 * replaces served index.html from the precache and reloaded the page
 * the moment a new build landed, which are the two things a board
 * member notices: last month's agenda on screen, and a form emptying
 * itself mid-sentence.
 *
 * The two placeholders below are filled in by
 * scripts/stampServiceWorker.mjs after the bundler runs (naming them in
 * this comment would get them substituted here too). The file is not
 * bundled and not served from src — the stamper writes the finished
 * copy to dist/sw.js.
 *
 * Written against bare `caches` and `fetch` so the whole file can be
 * evaluated with those passed in as arguments; see src/sw/sw.test.mjs.
 */

const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;

/** One cache per build, so the activate sweep can recognise its own. */
const CACHE = `trustee-tracker-${BUILD_ID}`;
const CACHE_PREFIX = 'trustee-tracker-';

/** What a navigation falls back to when the network is gone. */
const SHELL = '/index.html';

const PRECACHE_PATHS = new Set(PRECACHE);

/** Vite stamps a content hash into every bundled file it emits. */
const HASHED_ASSET = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/** One retry, far enough out to clear a blip, close enough to feel like loading. */
const RETRY_DELAY_MS = 400;

// ── Routing ──────────────────────────────────────────────────────

/**
 * Anything that talks to Microsoft. Graph and the login host are
 * cross-origin and so are already covered, but naming them keeps the
 * rule true if either is ever proxied through this origin: a cached
 * list of trustee business is worse than no offline support at all,
 * and a cached token is worse again.
 */
function isApi(url) {
  if (/(^|\.)(graph\.microsoft\.com|login\.microsoftonline\.com)$/.test(url.hostname)) {
    return true;
  }
  return url.pathname === '/api' || url.pathname.startsWith('/api/');
}

/**
 * Which of the three policies a request falls under. Pure, and the one
 * place the decision is made.
 */
function routeFor(request, origin) {
  if (request.method !== 'GET') return 'passthrough';

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return 'passthrough';
  }

  // Rule 3: the API, and everything not ours, is passed through
  // untouched — not read, not copied, not cached.
  if (url.origin !== origin) return 'passthrough';
  if (isApi(url)) return 'passthrough';

  // Rule 1: HTML is never served from cache while the network works.
  if (request.mode === 'navigate') return 'navigate';

  // Rule 2: a content-hashed URL's bytes never change, so cache-first
  // is free. These are the ones that get the retry.
  if (HASHED_ASSET.test(url.pathname)) return 'hashed';

  // The unhashed files we chose to precache — the manifest, an icon,
  // the two faces index.html preloads. Immutable within a build, and
  // the cache is per-build, so cache-first is safe for them too.
  if (PRECACHE_PATHS.has(url.pathname)) return 'precached';

  return 'passthrough';
}

// ── Handlers ─────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * One extra attempt on a network failure.
 *
 * A dropped image re-fetches itself and a dropped chunk lands in an
 * error boundary, but a dropped stylesheet paints the whole app
 * unstyled and an installed copy then resumes that wounded page for as
 * long as the user leaves it open. The URL is content-hashed, so a
 * later attempt can only ever fetch the same bytes.
 */
async function fetchWithOneRetry(request) {
  try {
    return await fetch(request);
  } catch (first) {
    await sleep(RETRY_DELAY_MS);
    try {
      return await fetch(request);
    } catch {
      throw first;
    }
  }
}

/**
 * Network first, always. Cache only on the way past, and only a
 * response that actually succeeded: a navigation that lands mid-deploy
 * gets a 5xx error page, and storing that would replace the shell with
 * an error screen for the rest of this build's life.
 */
async function handleNavigate(request, event) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const copy = response.clone();
      const write = caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
      if (event && typeof event.waitUntil === 'function') event.waitUntil(write);
    }
    return response;
  } catch (networkError) {
    const cached = await caches.match(SHELL, { cacheName: CACHE });
    if (cached) return cached;
    throw networkError;
  }
}

async function handleCacheFirst(request, event, withRetry) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = withRetry ? await fetchWithOneRetry(request) : await fetch(request);
  if (response && response.ok) {
    const write = cache.put(request, response.clone());
    if (event && typeof event.waitUntil === 'function') event.waitUntil(write);
  }
  return response;
}

/** Exposed for the routing tests; the fetch listener calls the same thing. */
function handleRequest(request, event) {
  switch (routeFor(request, self.location.origin)) {
    case 'navigate':
      return handleNavigate(request, event);
    case 'hashed':
      return handleCacheFirst(request, event, true);
    case 'precached':
      return handleCacheFirst(request, event, false);
    default:
      return null;
  }
}

// ── Lifecycle ────────────────────────────────────────────────────

/**
 * Every cache from an older build.
 *
 * Run twice on activate, once either side of clients.claim(). The
 * outgoing worker can still be finishing a cache write when the first
 * sweep runs, and caches.open on a name that was just deleted quietly
 * recreates it — stranding a whole build's assets on the device until
 * the update after next.
 */
async function sweepOldCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener('install', (event) => {
  // No skipWaiting: a waiting worker takes over when the last tab
  // closes, or the moment the page asks it to. Swapping under a
  // running page is how someone loses what they were typing.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await sweepOldCaches();
      await self.clients.claim();
      await sweepOldCaches();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const handled = handleRequest(event.request, event);
  if (handled) event.respondWith(handled);
});
