import type jsPDF from 'jspdf';

/**
 * Makes jsPDF emit a spec-complete font dictionary for the built-in
 * ("standard 14") fonts.
 *
 * jsPDF writes `/FirstChar 32 /LastChar 255` and then no `/Widths`, no
 * `/FontDescriptor` and no `/MissingWidth`. PDF 32000-1 §9.6.2.1 is
 * explicit that for the standard 14 those four entries "shall either
 * all be present or all be absent": a reader that sees the character
 * range and goes looking for the widths that must accompany it finds
 * nothing, and falls back to a default advance for every glyph. That is
 * what the uneven spacing and the overlapping letters in the printed
 * packet are — not kerning, and not anything in the content stream,
 * which is plain `Tj` throughout. Readers that carry their own copy of
 * the Helvetica metrics (poppler, and so most Linux tooling) paper over
 * it, which is why the fault shows up on some machines and not others.
 *
 * The fix is to supply the missing half: a real `/Widths` array, a
 * `/FontDescriptor`, and a `/MissingWidth` for the codes outside it.
 *
 * The widths written are jsPDF's own metrics, not the Adobe AFM values
 * they are rounded from. That is deliberate. Those are the numbers
 * `splitTextToSize` used to choose the line breaks, so declaring them
 * makes the rendered advance the same arithmetic as the measured one
 * and a line can never come out wider than the column it was wrapped
 * into. The rounding is to 1/100 em — under a tenth of a point at 11pt,
 * and below what a printer resolves.
 */

interface FontDescriptorMetrics {
  /** PDF font descriptor flag bits: fixed pitch | serif | nonsymbolic | italic. */
  flags: number;
  bbox: readonly [number, number, number, number];
  italicAngle: number;
  ascent: number;
  descent: number;
  capHeight: number;
  stemV: number;
}

const FIXED_PITCH = 1;
const SERIF = 2;
const NONSYMBOLIC = 32;
const ITALIC = 64;

/**
 * Descriptor values from the Adobe Core 14 AFM files. A descriptor for
 * a non-embedded standard font carries no FontFile — it exists only so
 * the required-entry rule above is satisfied and a substituting reader
 * has something to match against.
 */
const STANDARD_FONTS: Record<string, FontDescriptorMetrics> = {
  Helvetica: {
    flags: NONSYMBOLIC,
    bbox: [-166, -225, 1000, 931],
    italicAngle: 0,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 88,
  },
  'Helvetica-Bold': {
    flags: NONSYMBOLIC,
    bbox: [-170, -228, 1003, 962],
    italicAngle: 0,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 140,
  },
  'Helvetica-Oblique': {
    flags: NONSYMBOLIC | ITALIC,
    bbox: [-170, -225, 1116, 931],
    italicAngle: -12,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 88,
  },
  'Helvetica-BoldOblique': {
    flags: NONSYMBOLIC | ITALIC,
    bbox: [-174, -228, 1114, 962],
    italicAngle: -12,
    ascent: 718,
    descent: -207,
    capHeight: 718,
    stemV: 140,
  },
  'Times-Roman': {
    flags: NONSYMBOLIC | SERIF,
    bbox: [-168, -218, 1000, 898],
    italicAngle: 0,
    ascent: 683,
    descent: -217,
    capHeight: 662,
    stemV: 84,
  },
  'Times-Bold': {
    flags: NONSYMBOLIC | SERIF,
    bbox: [-168, -218, 1000, 935],
    italicAngle: 0,
    ascent: 683,
    descent: -217,
    capHeight: 676,
    stemV: 139,
  },
  'Times-Italic': {
    flags: NONSYMBOLIC | SERIF | ITALIC,
    bbox: [-169, -217, 1010, 883],
    italicAngle: -15.5,
    ascent: 683,
    descent: -217,
    capHeight: 653,
    stemV: 76,
  },
  'Times-BoldItalic': {
    flags: NONSYMBOLIC | SERIF | ITALIC,
    bbox: [-200, -218, 996, 921],
    italicAngle: -15,
    ascent: 683,
    descent: -217,
    capHeight: 669,
    stemV: 121,
  },
  Courier: {
    flags: FIXED_PITCH | NONSYMBOLIC | SERIF,
    bbox: [-23, -250, 715, 805],
    italicAngle: 0,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 51,
  },
  'Courier-Bold': {
    flags: FIXED_PITCH | NONSYMBOLIC | SERIF,
    bbox: [-113, -250, 749, 801],
    italicAngle: 0,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 106,
  },
  'Courier-Oblique': {
    flags: FIXED_PITCH | NONSYMBOLIC | SERIF | ITALIC,
    bbox: [-27, -250, 849, 805],
    italicAngle: -12,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 51,
  },
  'Courier-BoldOblique': {
    flags: FIXED_PITCH | NONSYMBOLIC | SERIF | ITALIC,
    bbox: [-57, -250, 869, 801],
    italicAngle: -12,
    ascent: 629,
    descent: -157,
    capHeight: 562,
    stemV: 106,
  },
};

/** The character-code range a WinAnsi-encoded simple font declares. */
export const FIRST_CHAR = 32;
export const LAST_CHAR = 255;

interface JsPdfFont {
  postScriptName: string;
  fontName: string;
  encoding?: string;
  objectNumber?: number;
  isAlreadyPutted?: boolean;
  metadata?: {
    Unicode?: {
      widths?: Record<string, number> & { fof?: number };
      encoding?: { WinAnsiEncoding?: Record<string, number> };
    };
  };
}

interface PutFontEvent {
  font: JsPdfFont;
  out: (s: string) => void;
  newObject: () => number;
}

/**
 * Character code → Unicode code point for WinAnsiEncoding, derived from
 * jsPDF's own table rather than hardcoded.
 *
 * Codes are their own code point everywhere except 0x80–0x9F, where
 * Windows-1252 puts typographic punctuation that Latin-1 leaves as
 * control characters. jsPDF stores that as Unicode → code because it
 * needs it to encode outgoing text; inverting it guarantees the widths
 * are indexed by exactly the bytes jsPDF writes into the stream.
 */
function unicodeForCode(font: JsPdfFont): (code: number) => number {
  const toWinAnsi = font.metadata?.Unicode?.encoding?.WinAnsiEncoding ?? {};
  const toUnicode = new Map<number, number>();
  for (const [codePoint, code] of Object.entries(toWinAnsi)) {
    toUnicode.set(code, Number(codePoint));
  }
  return (code) => toUnicode.get(code) ?? code;
}

/**
 * Characters jsPDF carries no metric for but which are, by definition,
 * another character's width. A non-breaking space is a space and a soft
 * hyphen is a hyphen in every one of these fonts, so the reader should
 * advance by that much rather than by the fallback.
 *
 * The rest of jsPDF's gaps — the superscript digits, the vulgar
 * fractions, Eth and Thorn — have no such equivalent and keep the
 * fallback. That is what `/MissingWidth` is for: a plausible advance, so
 * a character nobody expected still comes out spaced rather than
 * stacked.
 */
const EQUIVALENT_CODE_POINT: Record<number, number> = {
  0x00a0: 0x0020, // no-break space → space
  0x00ad: 0x002d, // soft hyphen → hyphen-minus
};

/**
 * The advance widths jsPDF measures with, in PDF glyph space (1/1000
 * em), for every code in the declared range.
 */
export function widthsForFont(font: JsPdfFont): { widths: number[]; missingWidth: number } | undefined {
  const table = font.metadata?.Unicode?.widths;
  if (!table) return undefined;
  const fractionOf = table.fof || 1;
  const toGlyphSpace = (em: number) => Math.round((em / fractionOf) * 1000);
  const missingWidth = toGlyphSpace(table[0] || fractionOf);
  const codeToUnicode = unicodeForCode(font);

  const widths: number[] = [];
  for (let code = FIRST_CHAR; code <= LAST_CHAR; code++) {
    const codePoint = codeToUnicode(code);
    const em = table[codePoint] ?? table[EQUIVALENT_CODE_POINT[codePoint]];
    widths.push(em === undefined ? missingWidth : toGlyphSpace(em));
  }
  return { widths, missingWidth };
}

function writeCompleteFont(event: PutFontEvent): void {
  const { font, out, newObject } = event;
  // An embedded font has already been written by jsPDF's own handler.
  if (font.isAlreadyPutted === true) return;
  if (font.encoding !== 'WinAnsiEncoding') return;
  const descriptor = STANDARD_FONTS[font.postScriptName];
  if (!descriptor) return;
  const metrics = widthsForFont(font);
  if (!metrics) return;

  const descriptorObject = newObject();
  out('<<');
  out('/Type /FontDescriptor');
  out(`/FontName /${font.postScriptName}`);
  out(`/Flags ${descriptor.flags}`);
  out(`/FontBBox [${descriptor.bbox.join(' ')}]`);
  out(`/ItalicAngle ${descriptor.italicAngle}`);
  out(`/Ascent ${descriptor.ascent}`);
  out(`/Descent ${descriptor.descent}`);
  out(`/CapHeight ${descriptor.capHeight}`);
  out(`/StemV ${descriptor.stemV}`);
  out(`/MissingWidth ${metrics.missingWidth}`);
  out('>>');
  out('endobj');

  font.objectNumber = newObject();
  out('<<');
  out('/Type /Font');
  out('/Subtype /Type1');
  out(`/BaseFont /${font.postScriptName}`);
  out(`/Encoding /${font.encoding}`);
  out(`/FirstChar ${FIRST_CHAR}`);
  out(`/LastChar ${LAST_CHAR}`);
  out(`/Widths [${metrics.widths.join(' ')}]`);
  out(`/FontDescriptor ${descriptorObject} 0 R`);
  out('>>');
  out('endobj');
  font.isAlreadyPutted = true;
}

/**
 * Attach the complete-font-dictionary writer to one document. Call it
 * immediately after constructing the jsPDF instance, before any text is
 * written. Subscribing per document rather than on `jsPDF.API` keeps
 * the change to the packet and out of anything else that might use
 * jsPDF.
 */
export function useCompleteFontMetrics(doc: jsPDF): void {
  doc.internal.events.subscribe('putFont', (event: PutFontEvent) => {
    writeCompleteFont(event);
  });
}
