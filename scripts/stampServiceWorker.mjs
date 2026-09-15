/**
 * Stamps the built service worker with a build id and a precache list.
 *
 * A browser decides whether to install a new worker by byte-comparing
 * the sw.js it fetches against the copy it holds. A worker whose bytes
 * never change is a worker that never updates, so it has to carry an
 * id — and the id has to be derived, because a hand-maintained one is
 * a hand-forgotten one.
 *
 * The id is the SHA-256 of every built file's path and contents, which
 * buys two things a timestamp or a random value does not:
 *
 *   - a deploy that changed something gets a new id, so every installed
 *     copy updates
 *   - a deploy that changed nothing gets the same id, so a rebuild, a
 *     re-run of CI or a redeploy of identical output does not churn an
 *     update notice through every device
 *
 * The worker itself is excluded from the hash, which would otherwise
 * be circular.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_ID_PLACEHOLDER = '__BUILD_ID__';
const PRECACHE_PLACEHOLDER = '__PRECACHE__';

/** How much of the digest ends up in the file. Collisions are not a threat model. */
const BUILD_ID_LENGTH = 16;

/** The worker cannot hash itself. */
const EXCLUDED_FROM_BUILD_ID = new Set(['/sw.js', '/sw.js.map']);

/**
 * Unhashed files worth having before the first paint: the manifest so
 * an installed copy keeps its name and icon offline, and one icon so
 * it keeps its face. The rest of /icons is filled on demand.
 */
const ALWAYS_PRECACHE = ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png'];

/** Every file under a directory, as posix paths rooted at "/". */
export async function readBuildFiles(distDir) {
  const out = [];
  async function walk(dir, prefix) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const rel = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(abs, rel);
      else if (entry.isFile()) out.push({ path: rel, bytes: await readFile(abs) });
    }
  }
  await walk(distDir, '');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A stable digest over the build. Path and contents both, so a file
 * moving without changing still counts as a change.
 */
export function computeBuildId(files) {
  const hash = createHash('sha256');
  for (const file of files.slice().sort((a, b) => a.path.localeCompare(b.path))) {
    if (EXCLUDED_FROM_BUILD_ID.has(file.path)) continue;
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.bytes);
    hash.update('\n');
  }
  return hash.digest('hex').slice(0, BUILD_ID_LENGTH);
}

function absoluteHref(value) {
  if (!value) return null;
  if (/^[a-z]+:/i.test(value) || value.startsWith('//')) return null; // off-origin
  return value.startsWith('/') ? value : `/${value}`;
}

/**
 * What the app needs in hand to paint: the entry bundle and stylesheet
 * index.html actually references, the manifest, one icon, and the
 * faces index.html preloads.
 *
 * Read out of the built HTML rather than globbed, because globbing
 * /assets sweeps in the lazily-loaded printing code — three quarters
 * of a megabyte that most sessions never ask for, downloaded before
 * the first screen draws.
 */
export function collectPrecache(indexHtml) {
  const entries = [];
  const preloads = [];

  const scripts = indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi);
  for (const [tag, src] of scripts) {
    if (!/\btype=["']module["']/i.test(tag)) continue;
    const href = absoluteHref(src);
    if (href) entries.push(href);
  }

  const links = indexHtml.matchAll(/<link\b[^>]*>/gi);
  for (const [tag] of links) {
    const relMatch = /\brel=["']([^"']+)["']/i.exec(tag);
    const hrefMatch = /\bhref=["']([^"']+)["']/i.exec(tag);
    const href = absoluteHref(hrefMatch && hrefMatch[1]);
    if (!relMatch || !href) continue;
    const rel = relMatch[1].toLowerCase();
    if (rel === 'stylesheet') entries.push(href);
    else if (rel === 'preload' && /\bas=["']font["']/i.test(tag)) {
      entries.push(href);
      preloads.push(href);
    }
  }

  const all = [...ALWAYS_PRECACHE, ...entries];
  // Source maps are for whoever is debugging, not for every device.
  const keep = all.filter((href) => !href.endsWith('.map'));
  return { precache: [...new Set(keep)], preloads };
}

/** Replace both placeholders, refusing anything already stamped. */
export function stampWorker(source, { buildId, precache }) {
  if (!source.includes(BUILD_ID_PLACEHOLDER)) {
    throw new Error(
      `Service worker source has no ${BUILD_ID_PLACEHOLDER} placeholder. ` +
        'It is either already stamped or it has been rewritten — either way ' +
        'the build would ship a worker that can never announce itself.',
    );
  }
  if (!source.includes(PRECACHE_PLACEHOLDER)) {
    throw new Error(
      `Service worker source has no ${PRECACHE_PLACEHOLDER} placeholder, ` +
        'so it would ship with nothing to precache.',
    );
  }
  return source
    .split(BUILD_ID_PLACEHOLDER)
    .join(buildId)
    .split(PRECACHE_PLACEHOLDER)
    .join(JSON.stringify(precache, null, 2));
}

/** Every precache entry has to be a file that was actually built. */
export function assertPresent({ precache, preloads }, files) {
  const present = new Set(files.map((f) => f.path));
  const missingPreload = preloads.filter((href) => !present.has(href));
  if (missingPreload.length > 0) {
    throw new Error(
      `index.html preloads ${missingPreload.join(', ')}, which the build did not ` +
        'produce. A preload of a file that is not there is a request every ' +
        'visitor makes and nobody answers.',
    );
  }
  const missing = precache.filter((href) => !present.has(href));
  if (missing.length > 0) {
    throw new Error(
      `Cannot precache ${missing.join(', ')} — not in the build. ` +
        'cache.addAll rejects as a unit, so the worker would fail to install.',
    );
  }
}

export async function stamp({ distDir, workerSourcePath, outFile }) {
  const files = await readBuildFiles(distDir);
  const indexFile = files.find((f) => f.path === '/index.html');
  if (!indexFile) throw new Error(`No index.html in ${distDir} — did the build run?`);

  const collected = collectPrecache(indexFile.bytes.toString('utf8'));
  assertPresent(collected, files);

  const buildId = computeBuildId(files);
  const source = await readFile(workerSourcePath, 'utf8');
  const stamped = stampWorker(source, { buildId, precache: collected.precache });
  await writeFile(outFile, stamped, 'utf8');
  return { buildId, precache: collected.precache };
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const result = await stamp({
    distDir: path.join(root, 'dist'),
    workerSourcePath: path.join(root, 'src', 'sw', 'sw.js'),
    outFile: path.join(root, 'dist', 'sw.js'),
  });
  const list = result.precache.map((p) => `    ${p}`).join('\n');
  process.stdout.write(`sw.js stamped — build ${result.buildId}\n${list}\n`);
}
