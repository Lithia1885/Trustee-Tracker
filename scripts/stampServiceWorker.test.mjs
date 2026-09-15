import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  assertPresent,
  collectPrecache,
  computeBuildId,
  readBuildFiles,
  stamp,
  stampWorker,
} from './stampServiceWorker.mjs';

const INDEX_HTML = `<!doctype html>
<html><head>
<link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="preload" href="/fonts/np-400.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/libre-caslon-400.woff2" as="font" type="font/woff2" crossorigin />
<script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-BBBBBBBB.css">
</head><body><div id="root"></div></body></html>`;

const WORKER = "const BUILD_ID = '__BUILD_ID__';\nconst PRECACHE = __PRECACHE__;\n";

/** A dist tree shaped like the real one. */
async function makeDist(overrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tt-dist-'));
  const files = {
    'index.html': INDEX_HTML,
    'manifest.webmanifest': '{"name":"Trustee Tracker"}',
    'assets/index-AAAAAAAA.js': 'console.log(1)',
    'assets/index-BBBBBBBB.css': 'body{}',
    'assets/pdf-CCCCCCCC.js': 'x'.repeat(400_000),
    'assets/index-AAAAAAAA.js.map': '{"version":3}',
    'icons/icon-192.png': 'png-192',
    'icons/icon-512.png': 'png-512',
    'fonts/np-400.woff2': 'font-a',
    'fonts/libre-caslon-400.woff2': 'font-b',
    'fonts/np-700.woff2': 'font-c',
    ...overrides,
  };
  for (const [rel, body] of Object.entries(files)) {
    if (body === null) continue;
    const abs = path.join(dir, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, body);
  }
  return dir;
}

describe('stamping the worker', () => {
  it('replaces both placeholders', () => {
    const out = stampWorker(WORKER, { buildId: 'abc123', precache: ['/index.html'] });
    expect(out).toContain("const BUILD_ID = 'abc123';");
    expect(out).toContain('"/index.html"');
    expect(out).not.toContain('__BUILD_ID__');
    expect(out).not.toContain('__PRECACHE__');
  });

  it('refuses to stamp a worker that is already stamped', () => {
    const once = stampWorker(WORKER, { buildId: 'abc123', precache: [] });
    expect(() => stampWorker(once, { buildId: 'def456', precache: [] })).toThrow(
      /__BUILD_ID__ placeholder/,
    );
  });

  it('refuses a worker whose precache placeholder is gone', () => {
    const rewritten = "const BUILD_ID = '__BUILD_ID__';\nconst PRECACHE = [];\n";
    expect(() => stampWorker(rewritten, { buildId: 'a', precache: [] })).toThrow(
      /__PRECACHE__ placeholder/,
    );
  });

  it('refuses a build whose preloaded font is missing', async () => {
    const dir = await makeDist({ 'fonts/np-400.woff2': null });
    await expect(
      stamp({
        distDir: dir,
        workerSourcePath: await writeWorker(dir),
        outFile: path.join(dir, 'sw.js'),
      }),
    ).rejects.toThrow(/preloads \/fonts\/np-400\.woff2/);
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses a build with no index.html', async () => {
    const dir = await makeDist({ 'index.html': null });
    await expect(
      stamp({
        distDir: dir,
        workerSourcePath: await writeWorker(dir),
        outFile: path.join(dir, 'sw.js'),
      }),
    ).rejects.toThrow(/No index\.html/);
    await rm(dir, { recursive: true, force: true });
  });
});

async function writeWorker(dir) {
  const p = path.join(dir, '..', `worker-${path.basename(dir)}.js`);
  await writeFile(p, WORKER);
  return p;
}

describe('the build id', () => {
  it('changes when the build changes', async () => {
    const a = await makeDist();
    const b = await makeDist({ 'assets/index-AAAAAAAA.js': 'console.log(2)' });
    expect(computeBuildId(await readBuildFiles(a))).not.toBe(
      computeBuildId(await readBuildFiles(b)),
    );
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });

  it('stays the same when the build does not', async () => {
    // A rebuild, a re-run of CI, a redeploy of byte-identical output.
    // None of those should push an update notice to every device.
    const a = await makeDist();
    const b = await makeDist();
    expect(computeBuildId(await readBuildFiles(a))).toBe(computeBuildId(await readBuildFiles(b)));
    await rm(a, { recursive: true, force: true });
    await rm(b, { recursive: true, force: true });
  });

  it('notices a file that moved without changing', () => {
    const before = [{ path: '/a.js', bytes: Buffer.from('same') }];
    const after = [{ path: '/b.js', bytes: Buffer.from('same') }];
    expect(computeBuildId(before)).not.toBe(computeBuildId(after));
  });

  it('ignores the worker itself, which cannot hash itself', () => {
    const base = [{ path: '/index.html', bytes: Buffer.from('hi') }];
    const withWorker = [...base, { path: '/sw.js', bytes: Buffer.from('anything at all') }];
    expect(computeBuildId(base)).toBe(computeBuildId(withWorker));
  });

  it('is 16 hex characters', () => {
    expect(computeBuildId([{ path: '/a', bytes: Buffer.from('a') }])).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('the precache list', () => {
  const { precache, preloads } = collectPrecache(INDEX_HTML);

  it('takes the entry bundle and stylesheet index.html actually references', () => {
    expect(precache).toContain('/assets/index-AAAAAAAA.js');
    expect(precache).toContain('/assets/index-BBBBBBBB.css');
  });

  it('takes the shell, the manifest, one icon and the preloaded faces', () => {
    expect(precache).toContain('/index.html');
    expect(precache).toContain('/manifest.webmanifest');
    expect(precache).toContain('/icons/icon-192.png');
    expect(precache).toContain('/fonts/np-400.woff2');
    expect(precache).toContain('/fonts/libre-caslon-400.woff2');
    expect(preloads).toEqual(['/fonts/np-400.woff2', '/fonts/libre-caslon-400.woff2']);
  });

  it('leaves the large optional payloads to fill on demand', async () => {
    // The printing code is three quarters of a megabyte most sessions
    // never ask for. Globbing /assets would download it before the
    // first screen drew.
    expect(precache.some((p) => p.includes('pdf-'))).toBe(false);
    const dir = await makeDist();
    const built = (await readBuildFiles(dir)).map((f) => f.path);
    expect(built).toContain('/assets/pdf-CCCCCCCC.js');
    expect(precache).not.toContain('/assets/pdf-CCCCCCCC.js');
    await rm(dir, { recursive: true, force: true });
  });

  it('excludes source maps', () => {
    const withMap = collectPrecache(
      INDEX_HTML.replace('index-BBBBBBBB.css', 'index-BBBBBBBB.css.map'),
    );
    expect(withMap.precache.some((p) => p.endsWith('.map'))).toBe(false);
  });

  it('leaves the unused fonts and icons out', () => {
    expect(precache).not.toContain('/fonts/np-700.woff2');
    expect(precache).not.toContain('/icons/icon-512.png');
    expect(precache).not.toContain('/icons/icon.svg');
  });

  it('ignores an off-origin script or sheet', () => {
    const { precache: p } = collectPrecache(
      '<script type="module" src="https://cdn.example.com/x.js"></script>' +
        '<link rel="stylesheet" href="https://cdn.example.com/x.css">',
    );
    expect(p.every((href) => href.startsWith('/'))).toBe(true);
    expect(p).not.toContain('https://cdn.example.com/x.js');
  });

  it('rejects an entry the build did not produce', () => {
    expect(() =>
      assertPresent({ precache: ['/assets/gone.js'], preloads: [] }, [
        { path: '/index.html', bytes: Buffer.from('') },
      ]),
    ).toThrow(/Cannot precache \/assets\/gone\.js/);
  });
});

describe('end to end', () => {
  it('writes a worker that parses, with the list and the id in it', async () => {
    const dir = await makeDist();
    const out = path.join(dir, 'sw.js');
    const result = await stamp({
      distDir: dir,
      workerSourcePath: await writeWorker(dir),
      outFile: out,
    });
    const written = await readFile(out, 'utf8');
    expect(written).toContain(result.buildId);
    expect(() => new Function(written)).not.toThrow();
    // Stamping is not idempotent by design — a second pass is a bug.
    expect(written).not.toContain('__BUILD_ID__');
    await rm(dir, { recursive: true, force: true });
  });
});
