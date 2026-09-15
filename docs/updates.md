# How the app updates itself

An installed copy of Trustee Tracker must never sit on stale code, and a
trustee must never watch the page reload out from under them. Those two
requirements are the whole design.

## The shape of it

| Piece | Where |
|---|---|
| The worker | `src/sw/sw.js` — source, with two placeholders |
| The stamper | `scripts/stampServiceWorker.mjs` — runs after `vite build` |
| Registration and the handshake | `src/pwa/registerSW.ts` |
| The offer | `src/components/UpdateBar.tsx` |
| Recognising a tab that outlived its build | `src/pwa/chunkError.ts` |
| The floor under a failed view | `src/components/LazyBoundary.tsx` |
| Last-ditch unstyled-page fuse | inline script at the end of `index.html` |

`npm run build` is `tsc -b && vite build && node scripts/stampServiceWorker.mjs`.
The worker is never served from `src/`; the stamper writes the finished
copy to `dist/sw.js`.

## The build id

A browser decides whether to install a new worker by byte-comparing the
`sw.js` it fetches against the copy it holds. A worker whose bytes never
change never updates anything, so it carries an id — and the id is
derived, because a hand-maintained one is a hand-forgotten one.

It is the SHA-256 of every built file's path and contents, excluding the
worker itself (which would be circular), truncated to 16 hex characters.
That buys two properties a timestamp or a random value does not:

- a deploy that changed something gets a new id, so every installed copy
  updates
- a deploy that changed **nothing** gets the same id, so a rebuild, a
  re-run of CI, or a redeploy of byte-identical output does not push an
  update notice to every device

Because the hash is over *built* output, a comment added to a source file
that the minifier strips is correctly not a new build.

## What gets precached

Only what the app needs to paint: the entry bundle and stylesheet
`index.html` actually references, the manifest, one icon, and the two
faces `index.html` preloads. Seven files.

The list is read out of the built `index.html` rather than globbed.
Globbing `/assets` sweeps in the printing code — about 775 KB across the
jsPDF chunk and its own dependencies — which most sessions never ask for
and which would otherwise download before the first screen drew. It
fills the runtime cache on demand instead.

The stamper fails loudly rather than shipping something wrong: it throws
if a placeholder is missing (already stamped, or the worker was
rewritten), if `index.html` preloads a file the build did not produce,
or if any precache entry is absent. `cache.addAll` rejects as a unit, so
a missing entry would mean a worker that cannot install at all.

## Caching policy

Three rules, and the first is the one that matters.

1. **HTML is never served from cache while the network works.**
   Navigations are network-first and fall back to the cached shell only
   when the fetch throws. A stale shell is the entire failure mode, so
   it gets no cache path at all. Only a response with `ok === true` is
   stored — a navigation landing mid-deploy returns a 5xx error page,
   and caching that would replace the shell with an error screen for the
   rest of the build's life.
2. **Content-hashed bundles are cached hard.** A hashed URL's bytes never
   change, so cache-first is free and a new build means new names. These
   get one retry, 400ms after a network failure: a dropped image
   re-fetches itself and a dropped chunk lands in the boundary, but a
   dropped stylesheet paints the whole app unstyled and an installed
   copy then resumes that wounded page indefinitely. The URL is
   immutable, so a later attempt can only fetch the same bytes.
3. **The API is never touched.** Graph and the login host pass straight
   through, uncached and unread — stale trustee business would be worse
   than no offline support, and a stale token worse again. Same for any
   other cross-origin request, and for any same-origin `/api/` path in
   case Graph is ever proxied through this origin.

On activate the worker deletes every cache belonging to an older build,
and does the sweep **twice** — once before `clients.claim()` and once
after. The outgoing worker can still be finishing a cache write when the
first sweep runs, and `caches.open` on a just-deleted name quietly
recreates it, stranding a whole build's assets on the device until the
update after next.

## The handshake

The worker does **not** call `skipWaiting()` on install. A waiting worker
takes over when the last tab closes — for an installed app, next time
it is opened — or immediately when the page asks. Swapping under a
running page is how someone loses what they were typing into a meeting
record. The worker answers a `SKIP_WAITING` message instead.

Registration runs from `src/main.tsx`, before the UI mounts and outside
the auth gate. Not from a component: if the only effect holding it
rendered after sign-in, a browser parked on the sign-in screen would
never register anything — and that copy is the one most likely to be
months behind.

The offer is a **bar, not a toast**, and it does not time out. Something
that fades after four seconds is how a trustee spends a month on last
month's build. It is dismissable, because nobody should be nagged
mid-task, and dismissing only hides it: the update still applies on its
own the next time the app is fully closed and reopened. The "Later"
button's tooltip says so.

Four things the handshake gets right that are easy to get wrong:

- **The tab that asks is the tab that reloads.** The worker claims every
  client, so one tab pressing "Reload now" fires `controllerchange` in
  all of them. A module-level `selfInitiated` flag — module state is
  per-tab — means the initiating tab reloads and every other tab is
  offered the same choice, and keeps running old code until someone
  takes it. Consent is per page.
- **No reload on the first claim.** On a first-ever visit there was no
  controller, so the newly installed worker claiming the page changed
  nothing underneath anyone and a reload would only make the app flash.
  "Has a worker ever controlled this page" is mutable state, not a
  constant read at startup: `controller` is still null while
  registration runs and only becomes set moments later, so a snapshot
  would leave the session that installed the worker unable to recognise
  a later swap.
- **The already-installing case is handled.** The browser runs its own
  byte-check at navigation time, and install is slow because it
  precaches the shell — so by the time our code runs, `updatefound` has
  usually already fired with nobody listening and `registration.waiting`
  is still null. `registration.installing` is checked explicitly and
  tracked. Without this the bar never appears for the whole session, and
  polling cannot rescue it: `update()` would compare against the worker
  that is by then waiting, find them identical, and fire nothing.
- **The button is never a no-op.** If nothing is waiting when it is
  clicked — another tab already applied the update — it does a plain
  reload, which lands on the new worker that is already live.

The app also calls `registration.update()` on `visibilitychange` and
every 30 minutes, for tabs left open for days.

## The second door

A tab held open across a deploy breaks the moment it reaches for a chunk
loaded on demand. In this app that is the **Print agenda** button, which
imports the jsPDF code lazily — the one thing that has to work at the
table.

`isStaleChunkError` in `src/pwa/chunkError.ts` recognises that class of
failure by message and error name. Every browser words it differently
and none of them mentions the actual problem: Safari says "'text/html'
is not a valid JavaScript MIME type", which reads like a bug in the app
rather than a page that needs reloading. Matching broadly is cheap
insurance — a false positive costs one page refresh, and even a
genuinely corrupt download wants reloading.

`reloadToCurrentBuild()` applies a waiting worker before reloading. A
plain reload would leave the old worker in charge, it would serve its
cached copy of the old entry bundle, and the next attempt would fail
identically.

It is wired into the print button (which shows a worded notice with a
**Reload** button rather than failing silently) and into `LazyBoundary`,
which wraps the routed view. The boundary distinguishes "this tab
predates the last update" — offer the reload, because re-importing a
dead URL can never work — from "the connection dropped", where a retry
re-imports without losing the page. Both get a button. An instruction
with no button is a chore.

`index.html` carries a last-ditch fuse: a listener for same-origin
stylesheet load errors that reloads exactly once, guarded by a
`sessionStorage` key cleared on successful load. Without it an unstyled
page can persist indefinitely in an installed copy, and the app cannot
report the failure because the app is what failed.

## In development

Nothing is registered, and anything a previous production visit left on
the same origin is actively unregistered, with its caches deleted. A
worker serving cached bundles over the dev server's module graph is an
afternoon of debugging a build that is not running.

A failed registration is never fatal. Without a worker the app still
works — it just loads from the network every time.

## Host configuration

`staticwebapp.config.json` carries the half of this that lives on the
server:

- `/sw.js`, `/index.html` and `/manifest.webmanifest` are `no-cache`. A
  cached `sw.js` is a device that never hears about a deploy.
- `/assets/*` is `immutable` for a year. The bytes behind one of those
  names never change.
- `navigationFallback.exclude` keeps `/assets/*` out of the SPA rewrite,
  so a request for a chunk a deploy renamed gets a 404 rather than
  `index.html`. Both are handled; the 404 is the cleaner failure.

## Tests

No browser required:

- `scripts/stampServiceWorker.test.mjs` — stamping, the two refusals,
  build-id stability and sensitivity, and what does and does not land in
  the precache list.
- `src/sw/sw.test.mjs` — loads the real `src/sw/sw.js` with `self`,
  `caches` and `fetch` passed in as arguments, and drives the fetch
  handler: navigations network-first, a non-ok navigation not cached,
  hashed assets cache-first with exactly one retry, API and cross-origin
  untouched, and the double sweep on activate.
- `src/pwa/chunkError.test.ts` — each browser's real wording, including
  a string captured from a genuinely renamed chunk, and a non-Error
  being thrown.
