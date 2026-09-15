import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampWorker } from '../../scripts/stampServiceWorker.mjs';

const ORIGIN = 'https://trustees.example.org';
const BUILD = 'aaaaaaaabbbbbbbb';
const CACHE = `trustee-tracker-${BUILD}`;
const PRECACHE = [
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/assets/index-AAAAAAAA.js',
  '/assets/index-BBBBBBBB.css',
  '/fonts/np-400.woff2',
];

const workerSource = stampWorker(
  await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), 'sw.js'),
    'utf8',
  ),
  { buildId: BUILD, precache: PRECACHE },
);

/** A Cache that remembers what was put in it. */
function makeCache() {
  const store = new Map();
  return {
    store,
    async match(request) {
      const key = typeof request === 'string' ? request : request.url;
      return store.get(key) ?? store.get(new URL(key, ORIGIN).pathname);
    },
    async put(request, response) {
      const key = typeof request === 'string' ? request : request.url;
      store.set(key, response);
    },
    async addAll(urls) {
      for (const url of urls) store.set(url, new Response('precached'));
    },
  };
}

/**
 * Loads the real worker file with its globals passed in, so the tests
 * drive the code that actually ships rather than a copy of it.
 */
function loadWorker({ fetchImpl } = {}) {
  const listeners = new Map();
  const caches = new Map([[CACHE, makeCache()]]);
  const deleted = [];

  const cachesApi = {
    async open(name) {
      if (!caches.has(name)) caches.set(name, makeCache());
      return caches.get(name);
    },
    async keys() {
      return [...caches.keys()];
    },
    async delete(name) {
      deleted.push(name);
      return caches.delete(name);
    },
    async match(request, options) {
      const cache = caches.get(options?.cacheName ?? CACHE);
      return cache ? cache.match(request) : undefined;
    },
  };

  const claim = vi.fn(async () => {});
  const skipWaiting = vi.fn();
  const self = {
    location: new URL(ORIGIN),
    clients: { claim },
    skipWaiting,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };

  const fetchImplementation = fetchImpl ?? (async () => new Response('network', { status: 200 }));
  const fetchSpy = vi.fn(fetchImplementation);

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', workerSource)(self, cachesApi, fetchSpy);

  /**
   * Drive a fetch event and return what respondWith was handed, if
   * anything. A plain object rather than a real Request: only the
   * browser may construct one with mode 'navigate', and these three
   * fields are all the worker reads.
   */
  async function dispatchFetch(url, init = {}) {
    const request = {
      method: init.method ?? 'GET',
      mode: init.mode ?? 'no-cors',
      url: new URL(url, ORIGIN).toString(),
    };
    let responded;
    const waited = [];
    listeners.get('fetch')({
      request,
      respondWith(value) {
        responded = value;
      },
      waitUntil(p) {
        waited.push(p);
      },
    });
    const response = responded === undefined ? undefined : await responded;
    await Promise.allSettled(waited);
    return { response, handled: responded !== undefined, request };
  }

  return { listeners, caches, cachesApi, deleted, claim, skipWaiting, fetchSpy, dispatchFetch };
}

describe('routing', () => {
  it('sends navigations to the network first and does not read the cache', async () => {
    const w = loadWorker({ fetchImpl: async () => new Response('<html>fresh</html>') });
    (await w.cachesApi.open(CACHE)).store.set('/index.html', new Response('<html>stale</html>'));

    const { response, handled } = await w.dispatchFetch('/', { mode: 'navigate' });
    expect(handled).toBe(true);
    expect(await response.text()).toBe('<html>fresh</html>');
    expect(w.fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('refreshes the cached shell from a navigation that succeeded', async () => {
    const w = loadWorker({ fetchImpl: async () => new Response('<html>fresh</html>') });
    await w.dispatchFetch('/', { mode: 'navigate' });
    const cache = await w.cachesApi.open(CACHE);
    expect(await (await cache.match('/index.html')).text()).toBe('<html>fresh</html>');
  });

  it('does not cache a navigation response that is not ok', async () => {
    // A navigation landing mid-deploy gets a 5xx error page. Caching
    // that replaces the shell with an error screen for the rest of
    // this build's life.
    const w = loadWorker({
      fetchImpl: async () => new Response('<h1>502 Bad Gateway</h1>', { status: 502 }),
    });
    const cache = await w.cachesApi.open(CACHE);
    cache.store.set('/index.html', new Response('<html>good shell</html>'));

    const { response } = await w.dispatchFetch('/', { mode: 'navigate' });
    expect(response.status).toBe(502);
    expect(await (await cache.match('/index.html')).text()).toBe('<html>good shell</html>');
  });

  it('falls back to the cached shell only when the network throws', async () => {
    const w = loadWorker({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    const cache = await w.cachesApi.open(CACHE);
    cache.store.set('/index.html', new Response('<html>offline shell</html>'));

    const { response } = await w.dispatchFetch('/agenda', { mode: 'navigate' });
    expect(await response.text()).toBe('<html>offline shell</html>');
  });

  it('serves a hashed asset from cache without touching the network', async () => {
    const w = loadWorker();
    const cache = await w.cachesApi.open(CACHE);
    cache.store.set(`${ORIGIN}/assets/index-AAAAAAAA.js`, new Response('cached bundle'));

    const { response } = await w.dispatchFetch('/assets/index-AAAAAAAA.js');
    expect(await response.text()).toBe('cached bundle');
    expect(w.fetchSpy).not.toHaveBeenCalled();
  });

  it('retries a hashed asset exactly once before giving up', async () => {
    let calls = 0;
    const w = loadWorker({
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('Failed to fetch');
        return new Response('second time lucky');
      },
    });
    const { response } = await w.dispatchFetch('/assets/index-BBBBBBBB.css');
    expect(calls).toBe(2);
    expect(await response.text()).toBe('second time lucky');
  });

  it('gives up after the one retry rather than hammering', async () => {
    const w = loadWorker({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(w.dispatchFetch('/assets/index-BBBBBBBB.css')).rejects.toThrow(/Failed to fetch/);
    expect(w.fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('serves the precached unhashed files cache-first too', async () => {
    const w = loadWorker();
    const cache = await w.cachesApi.open(CACHE);
    cache.store.set(`${ORIGIN}/fonts/np-400.woff2`, new Response('the face'));
    const { response, handled } = await w.dispatchFetch('/fonts/np-400.woff2');
    expect(handled).toBe(true);
    expect(await response.text()).toBe('the face');
  });

  it('leaves Microsoft Graph and the login host alone', async () => {
    const w = loadWorker();
    for (const url of [
      'https://graph.microsoft.com/v1.0/sites/x/lists/Items/items',
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    ]) {
      const { handled } = await w.dispatchFetch(url);
      expect(handled, url).toBe(false);
    }
    expect(w.fetchSpy).not.toHaveBeenCalled();
  });

  it('leaves a same-origin API path alone, in case Graph is ever proxied', async () => {
    const w = loadWorker();
    expect((await w.dispatchFetch('/api/items')).handled).toBe(false);
  });

  it('leaves every other cross-origin request alone', async () => {
    const w = loadWorker();
    expect((await w.dispatchFetch('https://cdn.example.com/x.js')).handled).toBe(false);
  });

  it('leaves an unhashed file it did not precache alone', async () => {
    const w = loadWorker();
    expect((await w.dispatchFetch('/icons/icon-512.png')).handled).toBe(false);
    expect((await w.dispatchFetch('/prototypes/mobile-b.jsx')).handled).toBe(false);
  });

  it('leaves writes alone', async () => {
    const w = loadWorker();
    expect((await w.dispatchFetch('/index.html', { method: 'POST' })).handled).toBe(false);
  });
});

describe('lifecycle', () => {
  it('precaches the stamped list on install and does not skip waiting', async () => {
    const w = loadWorker();
    const waited = [];
    w.listeners.get('install')({ waitUntil: (p) => waited.push(p) });
    await Promise.all(waited);
    const cache = await w.cachesApi.open(CACHE);
    expect([...cache.store.keys()].sort()).toEqual([...PRECACHE].sort());
    expect(w.skipWaiting).not.toHaveBeenCalled();
  });

  it('skips waiting only when the page asks', async () => {
    const w = loadWorker();
    w.listeners.get('message')({ data: { type: 'SOMETHING_ELSE' } });
    expect(w.skipWaiting).not.toHaveBeenCalled();
    w.listeners.get('message')({ data: { type: 'SKIP_WAITING' } });
    expect(w.skipWaiting).toHaveBeenCalledTimes(1);
  });

  it('survives a message with no data', () => {
    const w = loadWorker();
    expect(() => w.listeners.get('message')({})).not.toThrow();
  });

  it('sweeps older builds either side of claiming, and keeps its own', async () => {
    const w = loadWorker();
    await w.cachesApi.open('trustee-tracker-oldbuild00000000');
    await w.cachesApi.open('some-other-app-cache');

    // The outgoing worker finishing a write recreates a cache that the
    // first sweep just deleted; without the second sweep it survives.
    w.claim.mockImplementation(async () => {
      await w.cachesApi.open('trustee-tracker-oldbuild00000000');
    });

    const waited = [];
    w.listeners.get('activate')({ waitUntil: (p) => waited.push(p) });
    await Promise.all(waited);

    expect(w.claim).toHaveBeenCalled();
    expect(w.deleted.filter((n) => n === 'trustee-tracker-oldbuild00000000')).toHaveLength(2);
    expect([...w.caches.keys()]).toEqual([CACHE, 'some-other-app-cache']);
  });
});
