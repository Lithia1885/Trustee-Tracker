import type { Item, MeetingEntry } from '../types';

/**
 * When an entry's information took effect.
 *
 * A meeting outcome takes effect at the meeting. An update that arrived
 * between meetings takes effect when it was reported, which is what
 * `reportedDate` records. Rows written before that column existed have
 * no reported date, so they fall back to the meeting date — the same
 * value they have always been read with.
 */
export function effectiveDate(entry: MeetingEntry): string {
  return entry.reportedDate || entry.meetingDate;
}

// A pre-meeting update is, by construction, information the board had
// before the meeting started, so it sorts ahead of that meeting's own
// outcome when the two share a date.
function kindRank(entry: MeetingEntry): number {
  return entry.kind === 'Premeeting' ? 0 : 1;
}

// SharePoint row IDs are numeric strings. Compare them as numbers so 10
// sorts after 9, and fall back to a string compare for anything else.
function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/**
 * Total order over entries, oldest first. Deterministic for any two
 * distinct entries, so every screen, the reconciler and the PDF agree
 * on which entry is "latest" — including when several share a date.
 *
 * Order: effective date, then pre-meeting before in-meeting, then the
 * meeting's discussion order (SortOrder), then record ID.
 */
export function compareEntryChronology(a: MeetingEntry, b: MeetingEntry): number {
  const ad = effectiveDate(a);
  const bd = effectiveDate(b);
  if (ad !== bd) return ad < bd ? -1 : 1;
  const ak = kindRank(a);
  const bk = kindRank(b);
  if (ak !== bk) return ak - bk;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return compareIds(a.id, b.id);
}

/** Newest first — the same total order, reversed. */
export function compareEntryChronologyDesc(a: MeetingEntry, b: MeetingEntry): number {
  return compareEntryChronology(b, a);
}

export function sortedChronologically(entries: readonly MeetingEntry[]): MeetingEntry[] {
  return entries.slice().sort(compareEntryChronology);
}

/**
 * Is this entry an outcome recorded at a meeting held before the target
 * date? This is what makes a project "old business" rather than "new",
 * and what supplies last meeting's discussion order.
 *
 * A pre-meeting update is deliberately not a prior discussion: a project
 * first reported by email in September is still new business in
 * September.
 */
export function isPriorMeetingOutcome(entry: MeetingEntry, targetDate: string): boolean {
  return entry.kind !== 'Premeeting' && entry.meetingDate < targetDate;
}

/**
 * May this entry be shown on the agenda for `targetDate`?
 *
 * Pre-meeting updates appear on the agenda of the meeting they are
 * attached to, as long as they were reported by then. Meeting outcomes
 * appear only from the following agenda onward — what a meeting decides
 * is not part of the agenda handed out at that meeting, and must never
 * leak backwards into an earlier one.
 */
export function isVisibleOnAgenda(entry: MeetingEntry, targetDate: string): boolean {
  if (entry.kind === 'Premeeting') {
    return effectiveDate(entry) <= targetDate && entry.meetingDate <= targetDate;
  }
  return entry.meetingDate < targetDate;
}

export type SummarySource = 'update' | 'background';

export interface StatusSummary {
  /** Markdown, as authored. Callers decide how much of it to show. */
  text: string;
  source: SummarySource;
  /** Effective date of the update this came from; absent for background notes. */
  date?: string;
  entryId?: string;
}

/**
 * The single "where this stands" paragraph for a project on a given
 * agenda: the most recent update the board could have had by then,
 * falling back to the project's background notes.
 *
 * Both the agenda screen and the printed packet call this, so the
 * screen and the paper never disagree.
 */
export function selectStatusSummary(
  item: Item,
  entries: readonly MeetingEntry[],
  targetDate: string,
): StatusSummary | undefined {
  let best: MeetingEntry | undefined;
  for (const entry of entries) {
    if (entry.itemId !== item.id) continue;
    if (!entry.narrative?.trim()) continue;
    if (!isVisibleOnAgenda(entry, targetDate)) continue;
    if (!best || compareEntryChronology(best, entry) < 0) best = entry;
  }
  if (best?.narrative) {
    return {
      text: best.narrative.trim(),
      source: 'update',
      date: effectiveDate(best),
      entryId: best.id,
    };
  }
  const notes = item.notes?.trim();
  return notes ? { text: notes, source: 'background' } : undefined;
}

/**
 * Whole calendar months between two dates, counting month boundaries
 * rather than elapsed days. The board meets monthly, so this reads as
 * "how many meeting cycles ago" — Apr to Sep is five, whatever the days.
 */
export function monthsBetween(fromIso: string, toIso: string): number {
  const from = { y: Number(fromIso.slice(0, 4)), m: Number(fromIso.slice(5, 7)) };
  const to = { y: Number(toIso.slice(0, 4)), m: Number(toIso.slice(5, 7)) };
  if (!from.y || !from.m || !to.y || !to.m) return 0;
  return (to.y - from.y) * 12 + (to.m - from.m);
}

/** A summary older than this many monthly cycles reads as out of date. */
export const STALE_AFTER_CYCLES = 2;

/**
 * Has this summary been overtaken by time?
 *
 * Narratives are written in the present tense of the meeting that
 * produced them. "Art and Kevin meeting Saturday" was true in April and
 * says nothing useful in September, so the reader has to be able to see
 * how old it is.
 */
export function isSummaryStale(
  summary: StatusSummary | undefined,
  targetDate: string,
  cycles: number = STALE_AFTER_CYCLES,
): boolean {
  if (!summary?.date) return false;
  return monthsBetween(summary.date, targetDate) > cycles;
}

export interface SummarizeOptions {
  /** Longest rendering before the text is cut. */
  maxChars?: number;
  /** Don't end on a sentence earlier than this — too short to inform. */
  minSentence?: number;
  /** Don't hunt for a sentence break beyond this. */
  maxSentence?: number;
}

/**
 * A narrative shortened for a place that has room for a line or two:
 * the agenda row on screen, and the agenda body on paper.
 *
 * Purely a rendering concern — the stored narrative is untouched, and
 * the printed follow-up pages carry it in full.
 */
export function summarizeNarrative(markdown: string, options: SummarizeOptions = {}): string {
  const { maxChars = 140, minSentence = 40, maxSentence = 200 } = options;
  const firstPara = markdown.split(/\n\s*\n/)[0] ?? '';
  const stripped = stripMarkdown(firstPara);
  if (stripped.length <= maxChars) return stripped;

  // Prefer a real sentence break, but only one late enough to carry
  // some information and early enough to still be a summary.
  const breakIdx = stripped.slice(minSentence).search(/[.!?](\s|$)/);
  if (breakIdx >= 0 && breakIdx + minSentence < maxSentence) {
    return stripped.slice(0, breakIdx + minSentence + 1);
  }
  // Cut on a word, never through one: "Platinum Pr…" reads as a bug.
  const cut = stripped.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const body = lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut;
  return body.replace(/[\s,;:.]+$/, '') + '…';
}

/** Markdown reduced to the plain sentence underneath it. */
export function stripMarkdown(s: string): string {
  return (
    s
      // Leading list / blockquote / heading markers at line starts.
      .replace(/^[\s>*#-]+/gm, '')
      // Emphasis, code and strikethrough — not hyphens, which appear in
      // plain prose like "5-8 PM" or "6-7 panels".
      .replace(/[*_`~]{1,3}/g, '')
      .replace(/\[(.+?)\]\([^)]+\)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  );
}
