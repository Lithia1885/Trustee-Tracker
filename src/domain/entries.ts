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
