import type { Item, ItemStatus, MeetingEntry } from '../types';
import { compareEntryChronology, effectiveDate } from './entries';

/** Why a project holds the status it holds. */
export type StatusBasis =
  /** A meeting entry recorded this status change. */
  | 'event'
  /** Every status event was removed; the pre-tracking baseline applies. */
  | 'baseline'
  /** No status event and no recorded baseline; the stored value stands. */
  | 'stored';

export interface StatusResolution {
  status: ItemStatus;
  basis: StatusBasis;
  /** The status event that decided it, when the basis is 'event'. */
  source?: MeetingEntry;
  /** Effective date of that event. */
  on?: string;
}

/** Every status-changing entry for one project, oldest first. */
export function statusEventsFor(
  itemId: string,
  entries: readonly MeetingEntry[],
): MeetingEntry[] {
  return entries
    .filter((e) => e.itemId === itemId && !!e.statusChangeTo)
    .sort(compareEntryChronology);
}

/**
 * The status a project should hold, given its history.
 *
 * The event trail is the source of truth, and the trail is read in
 * event chronology — not in the order rows happened to be typed. So
 * entering June's history in September cannot undo what July recorded.
 * `compareEntryChronology` breaks ties deterministically, and the
 * reconciler, the agenda and the drift warning all resolve through here
 * so they can never disagree.
 *
 * When no status event survives — the last one was deleted, or its
 * status change was cleared — the project falls back to the baseline
 * captured before the first status event was recorded. Absent a
 * baseline (legacy rows that predate this app's tracking), the stored
 * status stands rather than being reset: a closed 2025 project must not
 * reopen itself because nobody ever typed its history in.
 */
export function resolveItemStatus(
  item: Item,
  entries: readonly MeetingEntry[],
): StatusResolution {
  const events = statusEventsFor(item.id, entries);
  const latest = events[events.length - 1];
  if (latest?.statusChangeTo) {
    return {
      status: latest.statusChangeTo,
      basis: 'event',
      source: latest,
      on: effectiveDate(latest),
    };
  }
  if (item.baselineStatus) {
    return { status: item.baselineStatus, basis: 'baseline' };
  }
  return { status: item.status, basis: 'stored' };
}

/**
 * The baseline to persist when a project's first status event is about
 * to be written: whatever it read before the board's history said
 * anything. Returns undefined when one is already recorded, or when
 * events already exist and the true baseline is no longer knowable.
 */
export function baselineToCapture(
  item: Item,
  entries: readonly MeetingEntry[],
): ItemStatus | undefined {
  if (item.baselineStatus) return undefined;
  if (statusEventsFor(item.id, entries).length > 0) return undefined;
  return item.status;
}
