import { describe, expect, it } from 'vitest';
import jsPDF from 'jspdf';
import { FIRST_CHAR, LAST_CHAR, useCompleteFontMetrics, widthsForFont } from './pdfFonts';
import { generateAgendaPdf } from './pdf';
import { generateAgenda } from './generator';
import { makeAction, makeItem, makeMeeting } from '../test/fixtures';

const TARGET = '2026-09-15';

interface FontObject {
  body: string;
  baseFont: string;
  widths?: number[];
}

/** The generated file as one byte-per-character string. */
function rawPdf(doc: jsPDF): string {
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  let raw = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return raw;
}

/** Every `/Type /Font` dictionary in the file, with its widths parsed. */
function fontObjects(doc: jsPDF): FontObject[] {
  return [...rawPdf(doc).matchAll(/\d+ 0 obj\s*([\s\S]*?)endobj/g)]
    .map((m) => m[1])
    .filter((body) => /\/Type\s*\/Font\b/.test(body))
    .map((body) => {
      const widths = /\/Widths \[([^\]]*)\]/.exec(body);
      return {
        body,
        baseFont: /\/BaseFont \/(\S+)/.exec(body)?.[1] ?? '',
        widths: widths ? widths[1].trim().split(/\s+/).map(Number) : undefined,
      };
    });
}

function samplePacket(): jsPDF {
  const items = [makeItem({ id: 'a', title: 'Roof Inspection', notes: 'Shingles bubbling.' })];
  return generateAgendaPdf({
    targetDate: TARGET,
    agenda: generateAgenda(items, [], TARGET),
    items,
    meeting: makeMeeting({ id: 'm', meetingDate: TARGET }),
    actionItems: [
      makeAction({ id: 'x1', itemId: 'a', assignee: 'Art Craddock', description: 'Get a quote' }),
    ],
  });
}

describe('printed packet font metrics', () => {
  it('declares widths for every font it writes', () => {
    const fonts = fontObjects(samplePacket());
    expect(fonts.length).toBeGreaterThan(0);
    for (const font of fonts) {
      expect(font.widths, `${font.baseFont} has no /Widths`).toBeDefined();
      expect(font.widths).toHaveLength(LAST_CHAR - FIRST_CHAR + 1);
      expect(font.body).toContain(`/FirstChar ${FIRST_CHAR}`);
      expect(font.body).toContain(`/LastChar ${LAST_CHAR}`);
      expect(font.body).toMatch(/\/FontDescriptor \d+ 0 R/);
    }
  });

  it('gives every descriptor a MissingWidth for codes outside the table', () => {
    const descriptors = [
      ...rawPdf(samplePacket()).matchAll(/\/Type \/FontDescriptor([\s\S]*?)>>/g),
    ];
    expect(descriptors.length).toBeGreaterThan(0);
    for (const [, body] of descriptors) {
      expect(body).toMatch(/\/MissingWidth \d+/);
      expect(body).toMatch(/\/Flags \d+/);
      expect(body).toMatch(/\/FontBBox \[-?\d+ -?\d+ -?\d+ -?\d+\]/);
    }
  });

  it('writes only the fonts the packet actually sets', () => {
    // jsPDF registers fourteen built-ins; the packet sets two. Emitting
    // the other twelve would put a 224-entry widths array behind each.
    const fonts = fontObjects(samplePacket());
    expect(fonts.map((f) => f.baseFont).sort()).toEqual(['Helvetica', 'Helvetica-Bold']);
  });

  it('declares the same widths it measured the line breaks with', () => {
    // A declared width that disagrees with the wrapping arithmetic is
    // how a line comes out wider than the column it was wrapped into.
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    doc.setFont('helvetica', 'normal');
    const font = doc.getFont();
    const metrics = widthsForFont(font as never);
    expect(metrics).toBeDefined();

    for (const char of 'AWimg .,-') {
      const measured = doc.getCharWidthsArray(char, { font, doKerning: false })[0];
      const declared = metrics!.widths[char.charCodeAt(0) - FIRST_CHAR];
      expect(declared, `width of ${JSON.stringify(char)}`).toBe(Math.round(measured * 1000));
    }
  });

  it('measures the punctuation the packet actually prints', () => {
    // The em dash, the ellipsis and the curly apostrophe reach the file
    // as WinAnsi high bytes, whose code is not their code point.
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    doc.setFont('helvetica', 'normal');
    const metrics = widthsForFont(doc.getFont() as never)!;
    const at = (code: number) => metrics.widths[code - FIRST_CHAR];
    expect(at(0x97)).toBe(1000); // em dash
    expect(at(0x96)).toBe(550); // en dash
    expect(at(0x85)).toBe(1000); // ellipsis
    expect(at(0x92)).toBe(220); // right single quote
    expect(at(0x95)).toBe(350); // bullet
  });

  it('gives a no-break space a space and a soft hyphen a hyphen', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    doc.setFont('helvetica', 'normal');
    const metrics = widthsForFont(doc.getFont() as never)!;
    const at = (code: number) => metrics.widths[code - FIRST_CHAR];
    expect(at(0xa0)).toBe(at(0x20));
    expect(at(0xad)).toBe(at(0x2d));
  });

  it('lays every printed line out inside the column, on declared widths alone', () => {
    // This is the whole point. A reader that carries no Helvetica
    // metrics of its own has nothing but `/Widths` to advance on, and
    // that is the reader the overlapping glyphs came from. Walk the
    // content streams the way it would and check that every line still
    // lands inside the text column.
    const doc = samplePacket();
    const raw = rawPdf(doc);
    const byName = new Map<string, number[]>();
    const objects = new Map(
      [...raw.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)].map((m) => [m[1], m[2]]),
    );
    for (const [, name, num] of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
      const widths = /\/Widths \[([^\]]*)\]/.exec(objects.get(num) ?? '');
      if (widths) byName.set(name, widths[1].trim().split(/\s+/).map(Number));
    }
    expect(byName.size).toBeGreaterThan(0);

    let widest = 0;
    let unmeasured = 0;
    for (const [, stream] of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
      let widths: number[] = [];
      let size = 11;
      const tokens = /\/(F\d+) ([\d.]+) Tf|\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
      for (const token of stream.matchAll(tokens)) {
        if (token[1]) {
          widths = byName.get(token[1]) ?? [];
          size = Number(token[2]);
          continue;
        }
        const text = token[3].replace(/\\([()\\])/g, '$1');
        let advance = 0;
        for (const char of text) {
          const code = char.charCodeAt(0);
          if (code < FIRST_CHAR || code > LAST_CHAR) unmeasured += 1;
          else advance += widths[code - FIRST_CHAR];
        }
        widest = Math.max(widest, (advance / 1000) * size);
      }
    }
    // 612pt page, 54pt margins.
    expect(unmeasured).toBe(0);
    expect(widest).toBeGreaterThan(0);
    expect(widest).toBeLessThanOrEqual(612 - 54 * 2);
  });

  it('leaves an embedded font to jsPDF', () => {
    // Only the built-in fonts are missing their metrics. Anything
    // jsPDF has already written is left exactly as it wrote it.
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    useCompleteFontMetrics(doc);
    let seen = 0;
    doc.internal.events.publish('putFont', {
      font: { postScriptName: 'Helvetica', encoding: 'WinAnsiEncoding', isAlreadyPutted: true },
      out: () => {
        seen += 1;
      },
      newObject: () => {
        seen += 1;
        return 1;
      },
    });
    expect(seen).toBe(0);
  });
});
