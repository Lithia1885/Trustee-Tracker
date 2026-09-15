import { describe, expect, it } from 'vitest';
import { isStaleChunkError } from './chunkError';

/**
 * The real wording, as each browser actually says it. None of them
 * mentions that the page is running against a build that is gone.
 */
const REAL_MESSAGES: Array<[string, Error]> = [
  [
    'Chrome, host rewrote the missing chunk to index.html',
    new TypeError(
      "Failed to load module script: Expected a JavaScript module script but the server " +
        "responded with a MIME type of 'text/html'. Strict MIME type checking is enforced " +
        'for module scripts per HTML spec.',
    ),
  ],
  [
    'Safari, shorter form',
    new TypeError("'text/html' is not a valid JavaScript MIME type."),
  ],
  [
    // Captured from Chromium 131 against a build whose print chunk a
    // deploy had renamed — both when the host 404s the missing file
    // (what staticwebapp.config.json does) and when it rewrites it to
    // index.html. The thrown error is the same either way; the
    // MIME-type wording above is what the console shows and what a
    // static module script throws.
    'Chrome and Edge (verified against a real renamed chunk)',
    new TypeError(
      'Failed to fetch dynamically imported module: ' +
        'http://127.0.0.1:8787/assets/pdf-Bl0NnW4V.js',
    ),
  ],
  [
    'Firefox',
    new TypeError('error loading dynamically imported module: https://x/assets/pdf-AAAA.js'),
  ],
  ['Safari, importing form', new TypeError('Importing a module script failed.')],
  ['WebKit, loading form', new TypeError('Unable to load a module script')],
];

describe('isStaleChunkError', () => {
  for (const [browser, error] of REAL_MESSAGES) {
    it(`recognises how ${browser} says it`, () => {
      expect(isStaleChunkError(error)).toBe(true);
    });
  }

  it('matches on the error name as well as the message', () => {
    // wasm-bindgen throws a LinkError whose message names no cause at
    // all — old glue against new bytes is the same illness.
    const linkError = new Error('table index is out of bounds');
    linkError.name = 'LinkError';
    expect(isStaleChunkError(linkError)).toBe(true);

    const bare = new Error('');
    bare.name = 'CompileError';
    expect(isStaleChunkError(bare)).toBe(true);
  });

  it('says no to an ordinary application error', () => {
    expect(isStaleChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isStaleChunkError(new TypeError('x.map is not a function'))).toBe(false);
    expect(isStaleChunkError(new Error('Graph returned 403'))).toBe(false);
  });

  it('survives a non-Error being thrown', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module: /a.js')).toBe(true);
    expect(isStaleChunkError({ message: 'Importing a module script failed.' })).toBe(true);
    expect(isStaleChunkError({ name: 'LinkError' })).toBe(true);
    expect(isStaleChunkError(undefined)).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
    expect(isStaleChunkError(42)).toBe(false);
    expect(isStaleChunkError({})).toBe(false);
  });

  it('does not throw on an object that throws when inspected', () => {
    // It runs inside somebody's catch block. Throwing from here would
    // bury the error it was called about.
    const hostile = {
      get name(): string {
        throw new Error('no');
      },
    };
    expect(isStaleChunkError(hostile)).toBe(false);
  });
});
