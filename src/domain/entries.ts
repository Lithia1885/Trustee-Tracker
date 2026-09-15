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
 * Words that mark a sentence as the outcome rather than the context.
 *
 * The brief's list — motion, second, carried, approved, canceled,
 * complete, declined, on hold — plus the inflections of each and the
 * few other verbs the board's own minutes use for the same act
 * (tabled, authorized, unanimous, denied, deferred, voted). The status
 * vocabulary in `Item.Status` is here for the same reason: a sentence
 * that says a project was tabled is reporting a decision.
 *
 * Two words on the list are deliberately narrowed, because the plain
 * word means something else far more often in this data than the
 * decision does:
 *
 * - "second" only counts as "seconded" or "second by". The board has a
 *   Second Floor Water Fountain on its books.
 * - "carried" does not count in "carried forward" or "carried over",
 *   which describe an item that was *not* decided.
 */
const DECISION_LANGUAGE =
  /\b(?:motion(?:ed|s)?|seconded|second by|carried(?!\s+(?:forward|over|on))|approv(?:e|es|ed|al)|unanimous(?:ly)?|authoriz(?:e|es|ed|ation)|cancel(?:l?ed|l?ation|s)?|complet(?:e|ed|ion)|declin(?:e|es|ed)|den(?:y|ies|ied|ial)|reject(?:s|ed)?|tabled|postpon(?:e|es|ed)|deferred|on hold|votes?|voted)\b/i;

/** Sentence-ending punctuation that is really an abbreviation. */
const ABBREVIATION_END = /(?:^|\s)(?:[A-Z]|Mr|Mrs|Ms|Dr|Rev|Fr|St|Jr|Sr|No|Approx|Est|vs|etc|a\.m|p\.m|A\.M|P\.M)\.$/;

/**
 * Plain text broken into sentences.
 *
 * A break is whitespace after `.`, `!` or `?` followed by something
 * that opens a sentence. Initials and the handful of abbreviations the
 * minutes actually use are stitched back on, so "Motion by Bill C.
 * Camp" stays one sentence.
 */
function splitSentences(text: string): string[] {
  // The delimiter is captured and stitched back on, so the terminator
  // stays with the sentence it ends. Requiring whitespace after it is
  // what keeps "ANAGO $951.25" in one piece.
  const pieces = text.split(/([.!?]["'\u2019\u201d)]*)\s+(?=["'\u2018\u201c(]?[A-Z0-9])/);
  const parts: string[] = [];
  for (let i = 0; i < pieces.length; i += 2) {
    parts.push(pieces[i] + (pieces[i + 1] ?? ''));
  }
  const merged: string[] = [];
  for (const part of parts) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && ABBREVIATION_END.test(previous)) {
      merged[merged.length - 1] = `${previous} ${part}`;
    } else {
      merged.push(part);
    }
  }
  return merged.map((s) => s.trim()).filter(Boolean);
}

/**
 * Words that cannot be the last thing an elision says. Stopping on
 * "received since the…" reads as a truncation bug; stopping on
 * "received…" reads as an elision.
 */
const DANGLING_WORDS = [
  'a', 'an', 'the', 'and', 'or', 'but', 'as', 'that', 'this', 'its', 'his', 'her', 'their',
  'our', 'is', 'are', 'was', 'were',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'over', 'under', 'per',
  'since', 'after', 'before', 'during', 'until', 'while', 'when', 'than', 'upon', 'about',
  'between', 'through', 'without', 'within', 'against', 'toward', 'towards',
];
const DANGLING_WORD = new RegExp(`(?:\\s|^)(?:${DANGLING_WORDS.join('|')})$`, 'i');

/** Cut to length on a word boundary — "Platinum Pr…" reads as a bug. */
function clampToWord(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  let body = lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut;
  body = body.replace(/[\s,;:.]+$/, '');
  while (DANGLING_WORD.test(body)) {
    body = body.replace(DANGLING_WORD, '').replace(/[\s,;:.]+$/, '');
  }
  return body + '\u2026';
}

/**
 * A narrative shortened for a place that has room for a line or two:
 * the agenda row on screen, and the agenda body on paper.
 *
 * Narratives are written as a story — what prompted the discussion,
 * then what was said, then what the board did about it. Taking the
 * opening sentence therefore tends to return the least useful sentence
 * in the paragraph: the furniture narrative opened with why a called
 * meeting was held and ended with the September sale being cancelled,
 * and only the second of those is the reason the line is on the
 * agenda. So the outcome is what gets found first, and the opening is
 * carried in front of it when there is room, because a decision on its
 * own often has no subject: "The 18-19 September sale was canceled."
 *
 * The outcome is hunted across the whole narrative — a decision in the
 * second paragraph is still the decision. Everything else reads the
 * first paragraph only, as before.
 *
 * Purely a rendering concern: the stored narrative is untouched, and
 * the printed follow-up pages carry it in full.
 */
export function summarizeNarrative(markdown: string, options: SummarizeOptions = {}): string {
  const { maxChars = 140, minSentence = 40, maxSentence = 200 } = options;
  const whole = stripMarkdown(markdown);
  // A narrative that opens on a blank line has no first paragraph to
  // read; treat the text as one.
  const opening = stripMarkdown(markdown.split(/\n\s*\n/)[0] ?? '') || whole;
  const sentences = splitSentences(whole);
  const lead = sentences[0] ?? opening;

  // The last match, not the first: a narrative that records a motion
  // and then what became of it is reporting the latter.
  let outcome: string | undefined;
  for (const sentence of sentences) {
    if (DECISION_LANGUAGE.test(sentence)) outcome = sentence;
  }

  // The opening paragraph already carries the outcome, or there is no
  // outcome to carry, and it fits. Print it as written.
  if (opening.length <= maxChars && (!outcome || opening.includes(outcome))) {
    return opening;
  }

  if (outcome && outcome !== lead) {
    if (outcome.length <= maxChars) {
      const room = maxChars - outcome.length - 1;
      if (lead.length <= room) return `${lead} ${outcome}`;
      // Not enough room for the whole opening, but an elided opening
      // still supplies the subject the outcome is missing.
      if (room >= minSentence) return `${clampToWord(lead, room)} ${outcome}`;
    }
    return clampToWord(outcome, maxChars);
  }

  // Either nothing was decided here or the decision is the first thing
  // said, so the opening is the summary. Prefer a real sentence break,
  // but only one late enough to carry some information and early
  // enough to still be a summary.
  const breakIdx = opening.slice(minSentence).search(/[.!?](\s|$)/);
  if (breakIdx >= 0 && breakIdx + minSentence < maxSentence) {
    return opening.slice(0, breakIdx + minSentence + 1);
  }
  return clampToWord(opening, maxChars);
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
