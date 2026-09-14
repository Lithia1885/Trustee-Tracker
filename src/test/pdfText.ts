import type jsPDF from 'jspdf';

/**
 * Pulls the text back out of a generated PDF, page by page.
 *
 * jsPDF writes uncompressed content streams by default, so the text
 * operators can be read directly. This lets the packet be asserted on
 * as the trustees will read it — including which page each line landed
 * on, which is how clipping and pagination get caught.
 */
export function extractPdfTextByPage(doc: jsPDF): string[] {
  const raw = toBinaryString(new Uint8Array(doc.output('arraybuffer')));
  const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => m[1]);
  return streams.map((stream) =>
    [...stream.matchAll(/\(((?:[^()\\]|\\.)*)\)\s*Tj/g)]
      .map((m) => unescapePdfString(m[1]))
      .join('\n'),
  );
}

/** One character per byte, so stream offsets stay honest. */
function toBinaryString(bytes: Uint8Array): string {
  let out = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

export function extractPdfText(doc: jsPDF): string {
  return extractPdfTextByPage(doc).join('\n');
}

function unescapePdfString(s: string): string {
  return s.replace(/\\([()\\])/g, '$1').replace(/[\u0080-\u009f]/g, (c) => WIN_ANSI_HIGH[c] ?? c);
}

/**
 * jsPDF encodes the built-in fonts as WinAnsi, where bullets, dashes
 * and quotes live in 0x80-0x9F. Reading the bytes as latin1 leaves them
 * as control characters, so map them back to what the reader will show.
 */
const WIN_ANSI_HIGH: Record<string, string> = {
  '\u0085': '…',
  '\u0091': '\u2018',
  '\u0092': '\u2019',
  '\u0093': '\u201c',
  '\u0094': '\u201d',
  '\u0095': '•',
  '\u0096': '–',
  '\u0097': '—',
};
