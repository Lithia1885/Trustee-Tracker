import {
  isPriorMeetingOutcome,
  selectStatusSummary,
  type StatusSummary,
} from '../domain/entries';
import type { AgendaSection, Item, MeetingEntry } from '../types';

export interface AgendaEntry {
  item: Item;
  section: AgendaSection;
  sortOrder: number;
  /** Date of the last meeting that actually discussed this project. */
  lastDiscussedDate?: string;
  /** Count of prior meeting discussions — not of pre-meeting updates. */
  priorEntryCount: number;
  /**
   * Where the project stands as of this agenda: the most recent update
   * the board could have had by then, or its background notes. The
   * screen and the printed packet both read this, so they agree.
   */
  summary?: StatusSummary;
}

export interface Agenda {
  targetDate: string;
  updates: AgendaEntry[];
  oldBusiness: AgendaEntry[];
  newBusiness: AgendaEntry[];
  tabled: AgendaEntry[];
  /**
   * Projects held back by a revisit date, kept out of the agenda proper
   * but available to the follow-up appendix so nothing disappears
   * silently.
   */
  deferred: AgendaEntry[];
}

const SECTION_BUCKETS: Record<AgendaSection, keyof Omit<Agenda, 'targetDate' | 'deferred'>> = {
  Update: 'updates',
  OldBusiness: 'oldBusiness',
  NewBusiness: 'newBusiness',
  Tabled: 'tabled',
};

interface PriorEntryStats {
  mostRecentBefore?: MeetingEntry;
  count: number;
}

function isMoreRecent(a: MeetingEntry, b: MeetingEntry): boolean {
  if (a.meetingDate !== b.meetingDate) return a.meetingDate > b.meetingDate;
  return a.sortOrder > b.sortOrder;
}

function indexEntriesByItem(
  entries: MeetingEntry[],
  targetDate: string,
): Map<string, PriorEntryStats> {
  const byItem = new Map<string, PriorEntryStats>();
  for (const entry of entries) {
    if (!isPriorMeetingOutcome(entry, targetDate)) continue;
    const stats = byItem.get(entry.itemId) ?? { count: 0 };
    stats.count += 1;
    if (!stats.mostRecentBefore || isMoreRecent(entry, stats.mostRecentBefore)) {
      stats.mostRecentBefore = entry;
    }
    byItem.set(entry.itemId, stats);
  }
  return byItem;
}

function classify(item: Item, hasPriorEntries: boolean): AgendaSection | null {
  if (item.status === 'Closed' || item.status === 'Declined') return null;
  if (item.status === 'Tabled' || item.onHoldReason) return 'Tabled';
  if (item.defaultSection !== 'Auto') {
    return item.defaultSection;
  }
  if (item.standing) return 'Update';
  if (!hasPriorEntries) return 'NewBusiness';
  return 'OldBusiness';
}

function compareEntries(a: AgendaEntry, b: AgendaEntry): number {
  const aHas = a.priorEntryCount > 0;
  const bHas = b.priorEntryCount > 0;
  if (aHas && bHas) {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.item.title.localeCompare(b.item.title);
  }
  if (aHas) return -1;
  if (bHas) return 1;
  return a.item.title.localeCompare(b.item.title);
}

export function generateAgenda(
  items: Item[],
  entries: MeetingEntry[],
  targetDate: string,
): Agenda {
  const priorByItem = indexEntriesByItem(entries, targetDate);
  const agenda: Agenda = {
    targetDate,
    updates: [],
    oldBusiness: [],
    newBusiness: [],
    tabled: [],
    deferred: [],
  };

  for (const item of items) {
    const stats = priorByItem.get(item.id);
    const hasPriorEntries = !!stats && stats.count > 0;
    const section = classify(item, hasPriorEntries);
    if (!section) continue;

    const entry: AgendaEntry = {
      item,
      section,
      sortOrder: stats?.mostRecentBefore?.sortOrder ?? Number.POSITIVE_INFINITY,
      lastDiscussedDate: stats?.mostRecentBefore?.meetingDate,
      priorEntryCount: stats?.count ?? 0,
      summary: selectStatusSummary(item, entries, targetDate),
    };

    if (item.deferredUntil && item.deferredUntil > targetDate) {
      agenda.deferred.push(entry);
      continue;
    }
    agenda[SECTION_BUCKETS[section]].push(entry);
  }

  agenda.updates.sort(compareEntries);
  agenda.oldBusiness.sort(compareEntries);
  agenda.newBusiness.sort(compareEntries);
  agenda.tabled.sort(compareEntries);
  agenda.deferred.sort(compareEntries);

  return agenda;
}
