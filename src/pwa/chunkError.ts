/**
 * Recognising a tab that has outlived its build.
 *
 * A page held open across a deploy breaks the moment it reaches for a
 * chunk that is loaded on demand: the hashed filename no longer exists,
 * the host answers with a 404 or — on hosts that rewrite unknown paths
 * — with index.html, and the module loader refuses either.
 *
 * Every browser words this differently and none of them mention the
 * actual problem. Safari says "'text/html' is not a valid JavaScript
 * MIME type", which reads like a bug in the app rather than a page that
 * needs reloading.
 */

const STALE_CHUNK_PATTERNS: RegExp[] = [
  // Safari, when the host rewrites the missing chunk to index.html.
  /not a valid JavaScript MIME type/i,
  // Chrome's longer form of the same thing, which never uses the word
  // "valid": "...the server responded with a MIME type of 'text/html'".
  /Failed to load module script/i,
  /Expected a JavaScript module script/i,
  // Chrome and Edge.
  /Failed to fetch dynamically imported module/i,
  // Firefox.
  /error loading dynamically imported module/i,
  // Safari and older WebKit.
  /Importing a module script failed/i,
  /Unable to load a module script/i,
  // WebAssembly: old glue paired with new bytes is the same illness,
  // and wasm-bindgen fails with wording that names no cause at all.
  // Nothing here loads wasm today; the patterns cost nothing and the
  // day something does, this is already right.
  /\b(LinkError|CompileError)\b/,
  /table index is out of bounds/i,
];

/**
 * Does this look like a page running against a build that is gone?
 *
 * Matching broadly is deliberate. A false positive costs one page
 * refresh, and even a genuinely corrupt download wants reloading — so
 * the only expensive answer here is "no" when it should have been
 * "yes", which is a blank screen and a phone call.
 */
export function isStaleChunkError(error: unknown): boolean {
  const described = describe(error);
  if (!described) return false;
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(described));
}

/** `name: message` for a real Error, best effort for whatever else was thrown. */
function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    // Reading a property can itself throw — a getter on a proxy, a
    // revoked object. This runs inside somebody's catch block, so
    // throwing from here would bury the error it was called about.
    try {
      const bag = error as { name?: unknown; message?: unknown };
      const name = typeof bag.name === 'string' ? bag.name : '';
      const message = typeof bag.message === 'string' ? bag.message : '';
      if (name || message) return `${name}: ${message}`;
      return String(error);
    } catch {
      return '';
    }
  }
  if (error === null || error === undefined) return '';
  try {
    return String(error);
  } catch {
    return '';
  }
}
