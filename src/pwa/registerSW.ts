/**
 * Service worker registration and the update handshake.
 *
 * Runs from the entry point, before the UI mounts and outside the auth
 * gate. Not from a component: if the only effect holding this rendered
 * after sign-in, a browser parked on the sign-in screen would never
 * register anything — and that is exactly the copy most likely to be
 * months behind.
 */

const SW_URL = '/sw.js';

/** Tabs left open for days still need to hear about a deploy. */
const POLL_INTERVAL_MS = 30 * 60 * 1000;

/** If the worker never hands over, reload anyway rather than hang on a click. */
const HANDOVER_TIMEOUT_MS = 2000;

export interface UpdateState {
  /** A new build is installed, or already live in another tab. */
  ready: boolean;
}

type Listener = (state: UpdateState) => void;

const listeners = new Set<Listener>();
let state: UpdateState = { ready: false };

/**
 * Module state is per-tab, which is the whole point: the worker claims
 * every client, so one tab pressing "Reload now" fires controllerchange
 * in all of them. Only the tab that asked reloads. Everyone else is
 * offered the same choice and keeps running old code until they take
 * it. Consent is per page.
 */
let selfInitiated = false;

/**
 * Has a worker ever controlled this page? Mutable, not a constant read
 * once at startup: `controller` is still null while registration runs
 * and only becomes set moments later, so a snapshot would leave the
 * session that installed the worker unable to recognise a later swap.
 */
let hasController = false;

let registration: ServiceWorkerRegistration | null = null;

export function subscribeToUpdates(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: UpdateState): void {
  if (next.ready === state.ready) return;
  state = next;
  for (const listener of listeners) listener(state);
}

/**
 * Move this tab onto the current build.
 *
 * Applies a waiting worker first when there is one. Reloading without
 * that leaves the old worker in charge, it serves its cached copy of
 * the old entry bundle, and the next attempt fails in exactly the same
 * way. When nothing is waiting — another tab already applied it — a
 * plain reload lands on the new worker, which is already live. The
 * button is never a no-op.
 */
export function reloadToCurrentBuild(): void {
  selfInitiated = true;
  const waiting = registration?.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  // controllerchange does the reload; this is the backstop.
  window.setTimeout(() => {
    window.location.reload();
  }, HANDOVER_TIMEOUT_MS);
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

function watchInstalling(worker: ServiceWorker | null): void {
  if (!worker) return;
  const check = () => {
    // "installed" with a controller already present means a new build
    // is waiting behind the running one.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      publish({ ready: true });
    }
  };
  check();
  worker.addEventListener('statechange', check);
}

/**
 * A worker left on this origin by a previous production visit will
 * happily serve its cached bundles over the dev server's module graph,
 * which is an afternoon of debugging a build that is not running.
 */
async function unregisterEverything(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(
      names.filter((n) => n.startsWith('trustee-tracker-')).map((n) => caches.delete(n)),
    );
  }
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  if (import.meta.env.DEV) {
    void unregisterEverything().catch(() => {
      /* nothing to clean up, or not allowed to — either is fine */
    });
    return;
  }

  hasController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (selfInitiated) {
      window.location.reload();
      return;
    }
    if (!hasController) {
      // First-ever claim. Nothing changed underneath anyone and there
      // is nothing to reload — the flash would be the only effect.
      hasController = true;
      return;
    }
    // Another tab applied an update. Offer it here; do not take the
    // page out from under whoever is using it.
    publish({ ready: true });
  });

  void navigator.serviceWorker
    .register(SW_URL, { scope: '/' })
    .then((reg) => {
      registration = reg;

      if (reg.waiting && navigator.serviceWorker.controller) {
        publish({ ready: true });
      }

      // The browser runs its own byte-check at navigation time, and
      // install is slow because it precaches the shell — so by the
      // time this runs, 'updatefound' has usually already fired with
      // nobody listening and `waiting` is still null. Polling cannot
      // rescue it: update() would compare against the worker that is
      // by then waiting, find them identical, and fire nothing.
      watchInstalling(reg.installing);
      reg.addEventListener('updatefound', () => {
        watchInstalling(reg.installing);
      });

      const poll = () => {
        void reg.update().catch(() => {
          /* offline, or the host is down; the next poll will do */
        });
      };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') poll();
      });
      window.setInterval(poll, POLL_INTERVAL_MS);
    })
    .catch(() => {
      // A failed registration is not fatal. Without a worker the app
      // still runs — it just loads from the network every time.
    });
}
