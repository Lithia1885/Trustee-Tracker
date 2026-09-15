/**
 * `ActionItem.dueHint` is free text on purpose — the board says "next
 * meeting" or "before the roof job" as often as it names a day. So this
 * reads a date out of the wording only when the wording plainly
 * contains one, and says nothing at all otherwise. A deadline the board
 * never expressed as a date is never called late.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const ISO = /(\d{4})-(\d{2})-(\d{2})/;
const MONTH_NAME = new RegExp(
  `\\b(${Object.keys(MONTHS).join('|')})\\.?\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?\\b`,
  'i',
);
const NUMERIC = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The date a due hint names, if it plainly names one.
 *
 * Recognises `2026-09-01`, `September 1` / `Sep 1, 2026`, and
 * `9/1/2026`, anywhere in the text — so "Before spec package release
 * ~2026-09-01" resolves, and "next meeting" does not. A month and day
 * with no year are read against `referenceDate`'s year.
 */
export function parseDueDate(hint: string | undefined, referenceDate: string): string | undefined {
  if (!hint) return undefined;
  const text = hint.trim();
  if (!text) return undefined;

  const isoMatch = ISO.exec(text);
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  const numeric = NUMERIC.exec(text);
  if (numeric) return iso(Number(numeric[3]), Number(numeric[1]), Number(numeric[2]));

  const named = MONTH_NAME.exec(text);
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : Number(referenceDate.slice(0, 4));
    return iso(year, month, day);
  }
  return undefined;
}

/**
 * Is this action's stated deadline already behind the meeting it is
 * being printed for? Only ever true when the hint parses as a date.
 */
export function isDueHintPastDue(hint: string | undefined, meetingDate: string): boolean {
  const due = parseDueDate(hint, meetingDate);
  return due !== undefined && due < meetingDate;
}
