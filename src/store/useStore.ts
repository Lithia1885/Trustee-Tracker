import type { PublicClientApplication } from '@azure/msal-browser';
import { create } from 'zustand';
import { createGraphClient, type GraphClient } from '../graph/client';
import {
  ListMissingError,
  createListItem,
  deleteListItem,
  fetchActionItems,
  fetchDecisions,
  fetchItems,
  fetchMeetingEntries,
  fetchMeetings,
  forgetAbsentColumns,
  isColumnKnownAbsent,
  patchListItemFields,
  resolveListIds,
} from '../graph/api';
import { baselineToCapture, resolveItemStatus } from '../domain/status';
import { SaveError, describeCause, isDefiniteRejection } from './saveError';
import type { AppEnv } from '../env';
import type {
  ActionItem,
  DefaultSection,
  Decision,
  EntryKind,
  EntrySection,
  Item,
  ItemStatus,
  Meeting,
  MeetingEntry,
  Tag,
} from '../types';

export type LoadKind = 'config' | 'auth' | 'unprovisioned' | 'graph' | 'unknown';

export interface LoadError {
  kind: LoadKind;
  message: string;
  missingList?: string;
}

export type DataStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Columns added after the first release. Every write that touches one
 * offers it as optional, so a site whose admin has not added it yet
 * keeps working — with the reduced behaviour described in
 * docs/sharepoint-columns.md.
 */
const OPTIONAL_ENTRY_COLUMNS = ['ReportedDate', 'EntryKind'] as const;
const OPTIONAL_ITEM_COLUMNS = ['BaselineStatus'] as const;

export interface MissingColumn {
  list: string;
  field: string;
}

export interface InterimUpdateInput {
  itemId: string;
  meetingId: string;
  narrative: string;
  section?: EntrySection;
  statusChangeTo?: ItemStatus;
  /** When the update was reported. Defaults to the meeting date. */
  reportedDate?: string;
}

export interface MeetingEntryInput {
  itemId: string;
  meetingId: string;
  section: EntrySection;
  sortOrder?: number;
  narrative: string;
  statusChangeTo?: ItemStatus;
  reportedDate?: string;
  kind?: EntryKind;
}

export interface MeetingEntryPatch {
  section?: EntrySection;
  sortOrder?: number;
  narrative?: string;
  statusChangeTo?: ItemStatus | null;
  reportedDate?: string | null;
  kind?: EntryKind;
}

export interface ActionItemPatch {
  description?: string;
  assignee?: string;
  dueHint?: string | null;
}

export interface DecisionPatch {
  summary?: string;
  decisionType?: 'Approval' | 'Denial' | 'Authorization' | 'Procedural';
  motionBy?: string | null;
  secondBy?: string | null;
  vote?: string | null;
  amount?: number | null;
  vendor?: string | null;
}

export interface MeetingDraft {
  meetingDate: string;
  meetingType: 'Regular' | 'Special';
  titleSuffix?: string;
  location?: string;
  membersPresent?: string;
  membersAbsent?: string;
  guests?: string;
  openingPrayerBy?: string;
  adjournedAt?: string;
  nextMeetingDate?: string;
  openCloseThisMonth?: string;
  openCloseNextMonth?: string;
}

export interface ActionItemDraft {
  meetingEntryId: string;
  itemId: string;
  meetingId: string;
  description: string;
  assignee: string;
  dueHint?: string;
}

export interface DecisionDraft {
  meetingEntryId: string;
  itemId: string;
  meetingId: string;
  summary: string;
  decisionType: 'Approval' | 'Denial' | 'Authorization' | 'Procedural';
  motionBy?: string;
  secondBy?: string;
  vote?: string;
  amount?: number;
  vendor?: string;
}

export interface ItemDraft {
  title: string;
  standing: boolean;
  defaultSection: DefaultSection;
  tags: Tag[];
  assignedTo: string;
  firstRaisedDate: string;
  onHoldReason: string;
  deferredUntil: string;
  closedDate: string;
  closedReason: string;
  notes: string;
}

interface SessionContext {
  client: GraphClient;
  env: AppEnv;
}

interface StoreState {
  status: DataStatus;
  error?: LoadError;
  items: Item[];
  meetings: Meeting[];
  meetingEntries: MeetingEntry[];
  actionItems: ActionItem[];
  decisions: Decision[];
  /** Optional columns this site turned out not to have. */
  missingColumns: MissingColumn[];
  hydrate: (instance: PublicClientApplication, env: AppEnv) => Promise<void>;
  setConfigError: (missing: string[]) => void;
  reset: () => void;
  createMeeting: (params: { meetingDate: string; meetingType?: 'Regular' | 'Special'; titleSuffix?: string }) => Promise<Meeting>;
  createMeetingFromDraft: (draft: MeetingDraft) => Promise<Meeting>;
  updateMeeting: (meetingId: string, draft: MeetingDraft) => Promise<void>;
  addInterimUpdate: (input: InterimUpdateInput) => Promise<MeetingEntry>;
  createMeetingEntry: (input: MeetingEntryInput) => Promise<MeetingEntry>;
  updateMeetingEntry: (entryId: string, patch: MeetingEntryPatch) => Promise<void>;
  deleteMeetingEntry: (entryId: string) => Promise<void>;
  reconcileItem: (itemId: string) => Promise<void>;
  createActionItem: (draft: ActionItemDraft) => Promise<ActionItem>;
  updateActionItem: (actionId: string, patch: ActionItemPatch) => Promise<void>;
  deleteActionItem: (actionId: string) => Promise<void>;
  completeActionItem: (params: { actionId: string; completedAtMeetingId?: string; completedNote?: string }) => Promise<void>;
  dropActionItem: (params: { actionId: string; completedNote?: string }) => Promise<void>;
  reopenActionItem: (params: { actionId: string }) => Promise<void>;
  createDecision: (draft: DecisionDraft) => Promise<Decision>;
  updateDecision: (decisionId: string, patch: DecisionPatch) => Promise<void>;
  deleteDecision: (decisionId: string) => Promise<void>;
  createItem: (draft: ItemDraft) => Promise<Item>;
  updateItem: (itemId: string, draft: ItemDraft) => Promise<void>;
}

function toError(err: unknown): LoadError {
  if (err instanceof ListMissingError) {
    return {
      kind: 'unprovisioned',
      message: `SharePoint list "${err.listName}" is missing. Provision it before continuing.`,
      missingList: err.listName,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/AADSTS|interaction_required|login_required/i.test(message)) {
    return { kind: 'auth', message };
  }
  return { kind: 'graph', message };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function entryTitle(meetingDate: string, itemTitle: string): string {
  return truncate(`${meetingDate} — ${itemTitle}`, 80);
}

function actionTitle(meetingDate: string, assignee: string, description: string): string {
  return truncate(`${meetingDate} — ${assignee}: ${description}`, 80);
}

function decisionTitleString(meetingDate: string, summary: string): string {
  return truncate(`${meetingDate} — ${summary}`, 80);
}

function meetingTitle(meetingDate: string, meetingType: 'Regular' | 'Special', suffix?: string): string {
  const base = `${meetingDate} ${meetingType}`;
  return suffix ? `${base} — ${suffix}` : base;
}

function meetingDraftToFields(draft: MeetingDraft): Record<string, unknown> {
  return {
    Title: meetingTitle(draft.meetingDate, draft.meetingType, draft.titleSuffix?.trim() || undefined),
    MeetingDate: draft.meetingDate,
    MeetingType: draft.meetingType,
    Location: draft.location?.trim() || null,
    MembersPresent: draft.membersPresent ?? null,
    MembersAbsent: draft.membersAbsent ?? null,
    Guests: draft.guests ?? null,
    OpeningPrayerBy: draft.openingPrayerBy?.trim() || null,
    AdjournedAt: draft.adjournedAt?.trim() || null,
    NextMeetingDate: draft.nextMeetingDate || null,
    OpenCloseThisMonth: draft.openCloseThisMonth?.trim() || null,
    OpenCloseNextMonth: draft.openCloseNextMonth?.trim() || null,
  };
}

function meetingDraftDiff(existing: Meeting, next: MeetingDraft): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  const nextTitle = meetingTitle(next.meetingDate, next.meetingType, next.titleSuffix?.trim() || undefined);
  if (nextTitle !== existing.title) diff.Title = nextTitle;
  if (next.meetingDate !== existing.meetingDate) diff.MeetingDate = next.meetingDate;
  if (next.meetingType !== existing.meetingType) diff.MeetingType = next.meetingType;
  const nextLoc = next.location?.trim() ?? '';
  if (nextLoc !== (existing.location ?? '')) diff.Location = nextLoc || null;
  if ((next.membersPresent ?? '') !== (existing.membersPresent ?? '')) {
    diff.MembersPresent = next.membersPresent ?? null;
  }
  if ((next.membersAbsent ?? '') !== (existing.membersAbsent ?? '')) {
    diff.MembersAbsent = next.membersAbsent ?? null;
  }
  if ((next.guests ?? '') !== (existing.guests ?? '')) {
    diff.Guests = next.guests ?? null;
  }
  const nextPrayer = next.openingPrayerBy?.trim() ?? '';
  if (nextPrayer !== (existing.openingPrayerBy ?? '')) diff.OpeningPrayerBy = nextPrayer || null;
  const nextAdj = next.adjournedAt?.trim() ?? '';
  if (nextAdj !== (existing.adjournedAt ?? '')) diff.AdjournedAt = nextAdj || null;
  if ((next.nextMeetingDate || '') !== (existing.nextMeetingDate ?? '')) {
    diff.NextMeetingDate = next.nextMeetingDate || null;
  }
  const nextOcThis = next.openCloseThisMonth?.trim() ?? '';
  if (nextOcThis !== (existing.openCloseThisMonth ?? '')) diff.OpenCloseThisMonth = nextOcThis || null;
  const nextOcNext = next.openCloseNextMonth?.trim() ?? '';
  if (nextOcNext !== (existing.openCloseNextMonth ?? '')) diff.OpenCloseNextMonth = nextOcNext || null;
  return diff;
}

function nextSortOrder(entries: readonly MeetingEntry[], meetingId: string, section: EntrySection): number {
  const max = entries
    .filter((e) => e.meetingId === meetingId && e.section === section)
    .reduce((acc, e) => Math.max(acc, e.sortOrder), 0);
  return max + 10;
}

function draftToFields(draft: ItemDraft, includeStatusForCreate: boolean): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    Title: draft.title.trim(),
    Standing: draft.standing,
    DefaultSection: draft.defaultSection,
    Tags: draft.tags,
    AssignedTo: draft.assignedTo.trim(),
    OnHoldReason: draft.onHoldReason.trim(),
    ClosedReason: draft.closedReason.trim(),
    Notes: draft.notes,
    FirstRaisedDate: draft.firstRaisedDate || null,
    DeferredUntil: draft.deferredUntil || null,
    ClosedDate: draft.closedDate || null,
  };
  if (includeStatusForCreate) {
    fields.Status = 'Open';
  }
  return fields;
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function itemDraftDiff(existing: Item, next: ItemDraft): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  const nextTitle = next.title.trim();
  if (nextTitle !== existing.title) diff.Title = nextTitle;
  if (next.standing !== existing.standing) diff.Standing = next.standing;
  if (next.defaultSection !== existing.defaultSection) diff.DefaultSection = next.defaultSection;
  if (!arraysEqual(next.tags, existing.tags)) diff.Tags = next.tags;
  const nextAssigned = next.assignedTo.trim();
  if (nextAssigned !== (existing.assignedTo ?? '')) diff.AssignedTo = nextAssigned;
  const nextOnHold = next.onHoldReason.trim();
  if (nextOnHold !== (existing.onHoldReason ?? '')) diff.OnHoldReason = nextOnHold;
  const nextClosedReason = next.closedReason.trim();
  if (nextClosedReason !== (existing.closedReason ?? '')) diff.ClosedReason = nextClosedReason;
  if (next.notes !== (existing.notes ?? '')) diff.Notes = next.notes;
  if ((next.firstRaisedDate || '') !== (existing.firstRaisedDate ?? '')) {
    diff.FirstRaisedDate = next.firstRaisedDate || null;
  }
  if ((next.deferredUntil || '') !== (existing.deferredUntil ?? '')) {
    diff.DeferredUntil = next.deferredUntil || null;
  }
  if ((next.closedDate || '') !== (existing.closedDate ?? '')) {
    diff.ClosedDate = next.closedDate || null;
  }
  return diff;
}

let session: SessionContext | undefined;

function requireSession(): SessionContext {
  if (!session) {
    throw new Error('Store mutation called before hydrate completed.');
  }
  return session;
}

/**
 * Saves currently in flight, keyed by what they would create.
 *
 * A second submit of the same thing — a double tap, an impatient second
 * press while the first request is still out — is refused rather than
 * sent, because the board's record must not end up with the same update
 * typed twice.
 */
const savesInFlight = new Set<string>();

async function guardDuplicate<T>(
  key: string,
  label: string,
  run: () => Promise<T>,
): Promise<T> {
  if (savesInFlight.has(key)) {
    throw new SaveError({
      outcome: 'already-saving',
      message: `This ${label} is already being saved.`,
      recovery: 'Give it a moment to finish. Saving again would record it twice.',
    });
  }
  savesInFlight.add(key);
  try {
    return await run();
  } finally {
    savesInFlight.delete(key);
  }
}

function currentMissingColumns(env: AppEnv): MissingColumn[] {
  const out: MissingColumn[] = [];
  for (const field of OPTIONAL_ENTRY_COLUMNS) {
    if (isColumnKnownAbsent(env.lists.meetingEntries, field)) {
      out.push({ list: 'MeetingEntries', field });
    }
  }
  for (const field of OPTIONAL_ITEM_COLUMNS) {
    if (isColumnKnownAbsent(env.lists.items, field)) {
      out.push({ list: 'Items', field });
    }
  }
  return out;
}

interface CreateSpec<T extends { id: string }> {
  listName: string;
  fields: Record<string, unknown>;
  optionalFields?: readonly string[];
  /** How to name the record in a message: "update", "project", … */
  label: string;
  /** Identifies a duplicate submission of this same record. */
  guardKey: string;
  refetch: () => Promise<T[]>;
  commit: (rows: T[]) => void;
  /**
   * Recognises the record from its content, so an interrupted save can
   * be checked against SharePoint instead of blindly repeated.
   */
  matches: (row: T) => boolean;
  /** Work that must follow the create, e.g. status reconciliation. */
  finish?: (rows: T[]) => Promise<void>;
}

/**
 * Refresh the list, then run whatever had to follow the create.
 *
 * Both halves can fail after the record is safely stored, which is the
 * case worth distinguishing: the record exists, so the recovery is to
 * finish the leftover work, never to write it again.
 */
async function settleCreate<T extends { id: string }>(
  spec: CreateSpec<T>,
  recordId: string,
): Promise<T[]> {
  let rows: T[];
  try {
    rows = await spec.refetch();
    spec.commit(rows);
  } catch (err) {
    throw new SaveError({
      outcome: 'saved-incomplete',
      recordId,
      message: `The ${spec.label} was saved, but this screen could not reload from SharePoint.`,
      recovery: 'Choose Finish saving to reload. Do not enter it again — it is already recorded.',
      resume: async () => {
        await settleCreate(spec, recordId);
      },
      resumeLabel: 'Finish saving',
      cause: err,
    });
  }
  if (spec.finish) {
    try {
      await spec.finish(rows);
    } catch (err) {
      throw new SaveError({
        outcome: 'saved-incomplete',
        recordId,
        message: `The ${spec.label} was saved, but the project status was not brought up to date.`,
        recovery:
          'Choose Finish saving to apply the status. Do not enter the update again — it is already recorded.',
        resume: async () => {
          await settleCreate(spec, recordId);
        },
        resumeLabel: 'Finish saving',
        cause: err,
      });
    }
  }
  return rows;
}

/**
 * Work out whether an interrupted create actually landed, by looking
 * for the record in SharePoint rather than sending the POST again.
 */
async function reconcileCreate<T extends { id: string }>(
  spec: CreateSpec<T>,
  cause: unknown,
): Promise<T> {
  let rows: T[];
  try {
    rows = await spec.refetch();
  } catch {
    throw new SaveError({
      outcome: 'unconfirmed',
      message: `The connection dropped while saving this ${spec.label}, and SharePoint could not be reached to check whether it went through.`,
      recovery:
        'Check your connection, then choose Check again. Do not re-type it yet — it may already be saved.',
      resume: async () => {
        const found = await reconcileCreate(spec, cause);
        await settleCreate(spec, found.id);
      },
      resumeLabel: 'Check again',
      cause,
    });
  }
  spec.commit(rows);
  const found = rows.find(spec.matches);
  if (!found) {
    throw new SaveError({
      outcome: 'not-saved',
      message: `This ${spec.label} was not saved — nothing reached SharePoint.`,
      recovery: `${describeCause(cause)}. Your text is still here; choose Save to try again.`,
      cause,
    });
  }
  return found;
}

async function createRecord<T extends { id: string }>(spec: CreateSpec<T>): Promise<T> {
  const { client, env } = requireSession();
  return guardDuplicate(spec.guardKey, spec.label, async () => {
    let recordId: string;
    try {
      const created = await createListItem(client, env.siteId, spec.listName, spec.fields, {
        optionalFields: spec.optionalFields,
      });
      recordId = created.id;
    } catch (err) {
      if (isDefiniteRejection(err)) {
        throw new SaveError({
          outcome: 'not-saved',
          message: `SharePoint refused to save this ${spec.label}, so nothing was recorded.`,
          recovery: `${describeCause(err)}. Your text is still here; fix the problem and choose Save.`,
          cause: err,
        });
      }
      // Could have landed. Look before leaping.
      recordId = (await reconcileCreate(spec, err)).id;
    }

    const rows = await settleCreate(spec, recordId);
    const created = rows.find((r) => r.id === recordId);
    if (!created) {
      throw new SaveError({
        outcome: 'saved-incomplete',
        recordId,
        message: `The ${spec.label} was saved, but it is not showing in the refreshed list yet.`,
        recovery: 'Choose Finish saving to reload. Do not enter it again — it is already recorded.',
        resume: async () => {
          await settleCreate(spec, recordId);
        },
        resumeLabel: 'Finish saving',
      });
    }
    return created;
  });
}

/**
 * Bring `Item.Status` in line with the project's status history, and
 * record the pre-tracking baseline when asked.
 *
 * The cached column is only ever a copy of what the event trail says,
 * and the trail is read in event chronology — so typing June's history
 * in September cannot undo what July recorded.
 */
async function applyResolvedStatus(
  itemId: string,
  entries: readonly MeetingEntry[],
  items: readonly Item[],
  baseline?: ItemStatus,
): Promise<Item[] | null> {
  if (!session) return null;
  const item = items.find((i) => i.id === itemId);
  if (!item) return null;

  const fields: Record<string, unknown> = {};
  const resolved = resolveItemStatus(item, entries);
  if (resolved.status !== item.status) fields.Status = resolved.status;
  if (baseline && !item.baselineStatus) fields.BaselineStatus = baseline;
  if (Object.keys(fields).length === 0) return null;

  await patchListItemFields(
    session.client,
    session.env.siteId,
    session.env.lists.items,
    item.id,
    fields,
    { optionalFields: OPTIONAL_ITEM_COLUMNS },
  );
  return fetchItems(session.client, session.env.siteId, session.env.lists.items);
}

/** An edit or delete that did not reach SharePoint. Repeating one is safe. */
function toRepeatableWriteError(err: unknown, label: string): SaveError {
  if (isDefiniteRejection(err)) {
    return new SaveError({
      outcome: 'not-saved',
      message: `SharePoint refused this ${label}, so nothing changed.`,
      recovery: `${describeCause(err)}. Fix the problem and try again.`,
      cause: err,
    });
  }
  return new SaveError({
    outcome: 'unconfirmed',
    resubmitSafe: true,
    message: `This ${label} may not have reached SharePoint — the connection failed before we heard back.`,
    recovery:
      'Check your connection and try again. Repeating an edit is safe; it cannot create a second copy.',
    cause: err,
  });
}

export const useStore = create<StoreState>((set, get) => {
  /** Reload the list, and say plainly if the record is saved but the screen is not. */
  async function settlePatch<T>(opts: {
    label: string;
    refetch: () => Promise<T[]>;
    commit: (rows: T[]) => void;
  }): Promise<void> {
    try {
      const rows = await opts.refetch();
      opts.commit(rows);
    } catch (err) {
      throw new SaveError({
        outcome: 'saved-incomplete',
        message: `The ${opts.label} was saved, but this screen could not reload from SharePoint.`,
        recovery: 'Choose Finish saving to reload. The change itself is already recorded.',
        resume: () => settlePatch(opts),
        resumeLabel: 'Finish saving',
        cause: err,
      });
    }
  }

  /** Reload entries and bring the project's cached status back in line. */
  async function refreshEntriesAndStatus(itemId: string, baseline?: ItemStatus): Promise<void> {
    const { client, env } = requireSession();
    const meetingEntries = await fetchMeetingEntries(client, env.siteId, env.lists.meetingEntries);
    set({ meetingEntries });
    const items = await applyResolvedStatus(itemId, meetingEntries, get().items, baseline);
    // Read after the writes, so a column this site turns out not to
    // have is reflected however it was discovered.
    set(items ? { items, missingColumns: currentMissingColumns(env) } : {
      missingColumns: currentMissingColumns(env),
    });
  }

  async function settleEntryChange(itemId: string, label: string): Promise<void> {
    try {
      await refreshEntriesAndStatus(itemId);
    } catch (err) {
      throw new SaveError({
        outcome: 'saved-incomplete',
        message: `The ${label} was saved, but the project status and this screen were not brought up to date.`,
        recovery: 'Choose Finish saving to reload. The change itself is already recorded.',
        resume: () => settleEntryChange(itemId, label),
        resumeLabel: 'Finish saving',
        cause: err,
      });
    }
  }

  return {
    status: 'idle',
    items: [],
    meetings: [],
    meetingEntries: [],
    actionItems: [],
    decisions: [],
    missingColumns: [],

    async hydrate(instance, env) {
      set({ status: 'loading', error: undefined });
      const client = createGraphClient(instance);
      try {
        const idMap = await resolveListIds(client, env.siteId, [
          env.lists.items,
          env.lists.meetings,
          env.lists.meetingEntries,
          env.lists.actionItems,
          env.lists.decisions,
          env.lists.vendors,
        ]);
        const resolved: AppEnv = {
          ...env,
          lists: {
            items: idMap[env.lists.items],
            meetings: idMap[env.lists.meetings],
            meetingEntries: idMap[env.lists.meetingEntries],
            actionItems: idMap[env.lists.actionItems],
            decisions: idMap[env.lists.decisions],
            vendors: idMap[env.lists.vendors],
          },
        };
        const [items, meetings, meetingEntries, actionItems, decisions] = await Promise.all([
          fetchItems(client, resolved.siteId, resolved.lists.items),
          fetchMeetings(client, resolved.siteId, resolved.lists.meetings),
          fetchMeetingEntries(client, resolved.siteId, resolved.lists.meetingEntries),
          fetchActionItems(client, resolved.siteId, resolved.lists.actionItems),
          fetchDecisions(client, resolved.siteId, resolved.lists.decisions),
        ]);
        session = { client, env: resolved };

        set({
          status: 'ready',
          items,
          meetings,
          meetingEntries,
          actionItems,
          decisions,
          missingColumns: currentMissingColumns(resolved),
          error: undefined,
        });
      } catch (err) {
        set({ status: 'error', error: toError(err) });
      }
    },

    setConfigError(missing) {
      set({
        status: 'error',
        error: {
          kind: 'config',
          message: `Missing required environment variables: ${missing.join(', ')}`,
        },
      });
    },

    reset() {
      session = undefined;
      savesInFlight.clear();
      forgetAbsentColumns();
      set({
        status: 'idle',
        items: [],
        meetings: [],
        meetingEntries: [],
        actionItems: [],
        decisions: [],
        missingColumns: [],
        error: undefined,
      });
    },

    async createMeeting({ meetingDate, meetingType = 'Regular', titleSuffix }) {
      return get().createMeetingFromDraft({ meetingDate, meetingType, titleSuffix });
    },

    async createMeetingFromDraft(draft) {
      const { client, env } = requireSession();
      const title = meetingTitle(
        draft.meetingDate,
        draft.meetingType,
        draft.titleSuffix?.trim() || undefined,
      );
      return createRecord<Meeting>({
        listName: env.lists.meetings,
        fields: meetingDraftToFields(draft),
        label: 'meeting',
        guardKey: `meeting:${title}`,
        refetch: () => fetchMeetings(client, env.siteId, env.lists.meetings),
        commit: (meetings) => set({ meetings }),
        matches: (m) => m.title === title && m.meetingDate === draft.meetingDate,
      });
    },

    async updateMeeting(meetingId, draft) {
      const { client, env } = requireSession();
      const existing = get().meetings.find((m) => m.id === meetingId);
      if (!existing) throw new Error(`Meeting ${meetingId} not found.`);
      const diff = meetingDraftDiff(existing, draft);
      if (Object.keys(diff).length === 0) return;
      try {
        await patchListItemFields(client, env.siteId, env.lists.meetings, meetingId, diff);
      } catch (err) {
        throw toRepeatableWriteError(err, 'meeting change');
      }
      await settlePatch({
        label: 'meeting',
        refetch: () => fetchMeetings(client, env.siteId, env.lists.meetings),
        commit: (meetings) => set({ meetings }),
      });
    },

    async createItem(draft) {
      const { client, env } = requireSession();
      const title = draft.title.trim();
      return createRecord<Item>({
        listName: env.lists.items,
        fields: draftToFields(draft, true),
        label: 'project',
        guardKey: `item:${title}`,
        refetch: () => fetchItems(client, env.siteId, env.lists.items),
        commit: (items) => set({ items }),
        matches: (i) => i.title === title,
      });
    },

    async updateItem(itemId, draft) {
      const { client, env } = requireSession();
      const existing = get().items.find((i) => i.id === itemId);
      if (!existing) throw new Error(`Item ${itemId} not found.`);
      const diff = itemDraftDiff(existing, draft);
      if (Object.keys(diff).length === 0) return;
      try {
        await patchListItemFields(client, env.siteId, env.lists.items, itemId, diff);
      } catch (err) {
        throw toRepeatableWriteError(err, 'project change');
      }
      await settlePatch({
        label: 'project',
        refetch: () => fetchItems(client, env.siteId, env.lists.items),
        commit: (items) => set({ items }),
      });
    },

    async addInterimUpdate({
      itemId,
      meetingId,
      narrative,
      section = 'Update',
      statusChangeTo,
      reportedDate,
    }) {
      return get().createMeetingEntry({
        itemId,
        meetingId,
        section,
        narrative,
        statusChangeTo,
        reportedDate,
        kind: 'Premeeting',
      });
    },

    async createMeetingEntry({
      itemId,
      meetingId,
      section,
      sortOrder,
      narrative,
      statusChangeTo,
      reportedDate,
      kind = 'InMeeting',
    }) {
      const { client, env } = requireSession();
      const state = get();
      const item = state.items.find((i) => i.id === itemId);
      const meeting = state.meetings.find((m) => m.id === meetingId);
      if (!item) throw new Error(`Item ${itemId} not found.`);
      if (!meeting) throw new Error(`Meeting ${meetingId} not found.`);

      const order = sortOrder ?? nextSortOrder(state.meetingEntries, meetingId, section);
      const text = narrative.trim();
      // Captured before the write, while the project's pre-tracking
      // status is still knowable.
      const baseline = statusChangeTo ? baselineToCapture(item, state.meetingEntries) : undefined;

      const fields: Record<string, unknown> = {
        Title: entryTitle(meeting.meetingDate, item.title),
        MeetingIdLookupId: Number(meeting.id),
        MeetingDate: meeting.meetingDate,
        ItemIdLookupId: Number(item.id),
        Section: section,
        SortOrder: order,
        Narrative: text,
        EntryKind: kind,
      };
      if (statusChangeTo) fields.StatusChangeTo = statusChangeTo;
      if (reportedDate) fields.ReportedDate = reportedDate;

      return createRecord<MeetingEntry>({
        listName: env.lists.meetingEntries,
        fields,
        optionalFields: OPTIONAL_ENTRY_COLUMNS,
        label: 'update',
        guardKey: `entry:${itemId}:${meetingId}:${text}`,
        refetch: () => fetchMeetingEntries(client, env.siteId, env.lists.meetingEntries),
        commit: (meetingEntries) =>
          set({ meetingEntries, missingColumns: currentMissingColumns(env) }),
        matches: (e) =>
          e.itemId === itemId && e.meetingId === meetingId && (e.narrative ?? '') === text,
        finish: async (entries) => {
          const items = await applyResolvedStatus(itemId, entries, get().items, baseline);
          set(items ? { items, missingColumns: currentMissingColumns(env) } : {
            missingColumns: currentMissingColumns(env),
          });
        },
      });
    },

    async updateMeetingEntry(entryId, patch) {
      const { client, env } = requireSession();
      const existing = get().meetingEntries.find((e) => e.id === entryId);
      if (!existing) throw new Error(`Meeting entry ${entryId} not found.`);

      const fields: Record<string, unknown> = {};
      const optionalFields: string[] = [];
      if (patch.section !== undefined && patch.section !== existing.section) {
        fields.Section = patch.section;
      }
      if (patch.sortOrder !== undefined && patch.sortOrder !== existing.sortOrder) {
        fields.SortOrder = patch.sortOrder;
      }
      if (patch.narrative !== undefined && patch.narrative !== (existing.narrative ?? '')) {
        fields.Narrative = patch.narrative;
      }
      if (patch.statusChangeTo !== undefined) {
        const next = patch.statusChangeTo === null ? null : patch.statusChangeTo;
        const current = existing.statusChangeTo ?? null;
        if (next !== current) {
          fields.StatusChangeTo = next;
        }
      }
      if (patch.reportedDate !== undefined) {
        const next = patch.reportedDate || null;
        const current = existing.reportedDate ?? null;
        if (next !== current) {
          fields.ReportedDate = next;
          optionalFields.push('ReportedDate');
        }
      }
      if (patch.kind !== undefined && patch.kind !== existing.kind) {
        fields.EntryKind = patch.kind;
        optionalFields.push('EntryKind');
      }
      if (Object.keys(fields).length === 0) return;

      try {
        await patchListItemFields(
          client,
          env.siteId,
          env.lists.meetingEntries,
          entryId,
          fields,
          { optionalFields },
        );
      } catch (err) {
        throw toRepeatableWriteError(err, 'update change');
      }
      await settleEntryChange(existing.itemId, 'change');
    },

    async deleteMeetingEntry(entryId) {
      const { client, env } = requireSession();
      const existing = get().meetingEntries.find((e) => e.id === entryId);
      if (!existing) return;

      try {
        await deleteListItem(client, env.siteId, env.lists.meetingEntries, entryId);
      } catch (err) {
        throw toRepeatableWriteError(err, 'deletion');
      }
      await settleEntryChange(existing.itemId, 'deletion');
    },

    async reconcileItem(itemId) {
      requireSession();
      const state = get();
      const items = await applyResolvedStatus(itemId, state.meetingEntries, state.items);
      if (items) set({ items });
    },

    async createActionItem(draft) {
      const { client, env } = requireSession();
      const meeting = get().meetings.find((m) => m.id === draft.meetingId);
      if (!meeting) throw new Error(`Meeting ${draft.meetingId} not found.`);

      const description = draft.description.trim();
      const assignee = draft.assignee.trim();
      if (!description) throw new Error('Description is required.');
      if (!assignee) throw new Error('Assignee is required.');

      const fields: Record<string, unknown> = {
        Title: actionTitle(meeting.meetingDate, assignee, description),
        Description: description,
        Assignee: assignee,
        MeetingEntryIdLookupId: Number(draft.meetingEntryId),
        ItemIdLookupId: Number(draft.itemId),
        AssignedAtMeetingIdLookupId: Number(draft.meetingId),
        Status: 'Open',
      };
      if (draft.dueHint?.trim()) fields.DueHint = draft.dueHint.trim();

      return createRecord<ActionItem>({
        listName: env.lists.actionItems,
        fields,
        label: 'action item',
        guardKey: `action:${draft.meetingEntryId}:${assignee}:${description}`,
        refetch: () => fetchActionItems(client, env.siteId, env.lists.actionItems),
        commit: (actionItems) => set({ actionItems }),
        matches: (a) =>
          a.meetingEntryId === draft.meetingEntryId &&
          a.description === description &&
          a.assignee === assignee,
      });
    },

    async updateActionItem(actionId, patch) {
      const { client, env } = requireSession();
      const state = get();
      const existing = state.actionItems.find((a) => a.id === actionId);
      if (!existing) throw new Error(`Action item ${actionId} not found.`);
      const meeting = state.meetings.find((m) => m.id === existing.assignedAtMeetingId);

      const fields: Record<string, unknown> = {};
      const nextDescription =
        patch.description !== undefined ? patch.description.trim() : existing.description;
      const nextAssignee =
        patch.assignee !== undefined ? patch.assignee.trim() : existing.assignee;
      if (patch.description !== undefined && nextDescription !== existing.description) {
        if (!nextDescription) throw new Error('Description is required.');
        fields.Description = nextDescription;
      }
      if (patch.assignee !== undefined && nextAssignee !== existing.assignee) {
        if (!nextAssignee) throw new Error('Assignee is required.');
        fields.Assignee = nextAssignee;
      }
      if (patch.dueHint !== undefined) {
        const next = patch.dueHint?.trim() || null;
        const current = existing.dueHint ?? null;
        if (next !== current) fields.DueHint = next;
      }
      if ((fields.Description || fields.Assignee) && meeting) {
        fields.Title = actionTitle(meeting.meetingDate, nextAssignee, nextDescription);
      }
      if (Object.keys(fields).length === 0) return;

      try {
        await patchListItemFields(client, env.siteId, env.lists.actionItems, actionId, fields);
      } catch (err) {
        throw toRepeatableWriteError(err, 'action item change');
      }
      await settlePatch({
        label: 'action item',
        refetch: () => fetchActionItems(client, env.siteId, env.lists.actionItems),
        commit: (actionItems) => set({ actionItems }),
      });
    },

    async deleteActionItem(actionId) {
      const { client, env } = requireSession();
      try {
        await deleteListItem(client, env.siteId, env.lists.actionItems, actionId);
      } catch (err) {
        throw toRepeatableWriteError(err, 'deletion');
      }
      await settlePatch({
        label: 'deletion',
        refetch: () => fetchActionItems(client, env.siteId, env.lists.actionItems),
        commit: (actionItems) => set({ actionItems }),
      });
    },

    async completeActionItem({ actionId, completedAtMeetingId, completedNote }) {
      const { client, env } = requireSession();
      const fields: Record<string, unknown> = { Status: 'Done' };
      if (completedAtMeetingId) {
        fields.CompletedAtMeetingIdLookupId = Number(completedAtMeetingId);
      }
      if (completedNote !== undefined) {
        fields.CompletedNote = completedNote.trim() || null;
      }
      try {
        await patchListItemFields(client, env.siteId, env.lists.actionItems, actionId, fields);
      } catch (err) {
        throw toRepeatableWriteError(err, 'action item change');
      }
      await settlePatch({
        label: 'action item',
        refetch: () => fetchActionItems(client, env.siteId, env.lists.actionItems),
        commit: (actionItems) => set({ actionItems }),
      });
    },

    async dropActionItem({ actionId, completedNote }) {
      const { client, env } = requireSession();
      const fields: Record<string, unknown> = { Status: 'Dropped' };
      if (completedNote !== undefined) {
        fields.CompletedNote = completedNote.trim() || null;
      }
      try {
        await patchListItemFields(client, env.siteId, env.lists.actionItems, actionId, fields);
      } catch (err) {
        throw toRepeatableWriteError(err, 'action item change');
      }
      await settlePatch({
        label: 'action item',
        refetch: () => fetchActionItems(client, env.siteId, env.lists.actionItems),
        commit: (actionItems) => set({ actionItems }),
      });
    },

    async reopenActionItem({ actionId }) {
      const { client, env } = requireSession();
      try {
        await patchListItemFields(client, env.siteId, env.lists.actionItems, actionId, {
          Status: 'Open',
          CompletedNote: null,
          CompletedAtMeetingIdLookupId: null,
        });
      } catch (err) {
        throw toRepeatableWriteError(err, 'action item change');
      }
      await settlePatch({
        label: 'action item',
        refetch: () => fetchActionItems(client, env.siteId, env.lists.actionItems),
        commit: (actionItems) => set({ actionItems }),
      });
    },

    async createDecision(draft) {
      const { client, env } = requireSession();
      const meeting = get().meetings.find((m) => m.id === draft.meetingId);
      if (!meeting) throw new Error(`Meeting ${draft.meetingId} not found.`);

      const summary = draft.summary.trim();
      if (!summary) throw new Error('Summary is required.');

      const fields: Record<string, unknown> = {
        Title: decisionTitleString(meeting.meetingDate, summary),
        Summary: summary,
        MeetingEntryIdLookupId: Number(draft.meetingEntryId),
        MeetingIdLookupId: Number(draft.meetingId),
        ItemIdLookupId: Number(draft.itemId),
        DecisionDate: meeting.meetingDate,
        DecisionType: draft.decisionType,
      };
      if (draft.motionBy?.trim()) fields.MotionBy = draft.motionBy.trim();
      if (draft.secondBy?.trim()) fields.SecondBy = draft.secondBy.trim();
      if (draft.vote?.trim()) fields.Vote = draft.vote.trim();
      if (typeof draft.amount === 'number' && Number.isFinite(draft.amount)) {
        fields.Amount = draft.amount;
      }
      if (draft.vendor?.trim()) fields.Vendor = draft.vendor.trim();

      return createRecord<Decision>({
        listName: env.lists.decisions,
        fields,
        label: 'decision',
        guardKey: `decision:${draft.meetingEntryId}:${summary}`,
        refetch: () => fetchDecisions(client, env.siteId, env.lists.decisions),
        commit: (decisions) => set({ decisions }),
        matches: (d) => d.meetingEntryId === draft.meetingEntryId && d.summary === summary,
      });
    },

    async updateDecision(decisionId, patch) {
      const { client, env } = requireSession();
      const existing = get().decisions.find((d) => d.id === decisionId);
      if (!existing) throw new Error(`Decision ${decisionId} not found.`);

      const fields: Record<string, unknown> = {};
      if (patch.summary !== undefined) {
        const next = patch.summary.trim();
        if (!next) throw new Error('Summary is required.');
        if (next !== existing.summary) {
          fields.Summary = next;
          fields.Title = decisionTitleString(existing.decisionDate, next);
        }
      }
      if (patch.decisionType !== undefined && patch.decisionType !== existing.decisionType) {
        fields.DecisionType = patch.decisionType;
      }
      const textFieldEdits: Array<[keyof DecisionPatch, string, string | undefined]> = [
        ['motionBy', 'MotionBy', existing.motionBy],
        ['secondBy', 'SecondBy', existing.secondBy],
        ['vote', 'Vote', existing.vote],
        ['vendor', 'Vendor', existing.vendor],
      ];
      for (const [key, fieldName, current] of textFieldEdits) {
        if (patch[key] === undefined) continue;
        const raw = patch[key] as string | null | undefined;
        const next = raw === null || raw === undefined ? null : raw.trim() || null;
        if (next !== (current ?? null)) fields[fieldName] = next;
      }
      if (patch.amount !== undefined) {
        const next =
          patch.amount === null
            ? null
            : typeof patch.amount === 'number' && Number.isFinite(patch.amount)
              ? patch.amount
              : null;
        const current = existing.amount ?? null;
        if (next !== current) fields.Amount = next;
      }
      if (Object.keys(fields).length === 0) return;

      try {
        await patchListItemFields(client, env.siteId, env.lists.decisions, decisionId, fields);
      } catch (err) {
        throw toRepeatableWriteError(err, 'decision change');
      }
      await settlePatch({
        label: 'decision',
        refetch: () => fetchDecisions(client, env.siteId, env.lists.decisions),
        commit: (decisions) => set({ decisions }),
      });
    },

    async deleteDecision(decisionId) {
      const { client, env } = requireSession();
      try {
        await deleteListItem(client, env.siteId, env.lists.decisions, decisionId);
      } catch (err) {
        throw toRepeatableWriteError(err, 'deletion');
      }
      await settlePatch({
        label: 'deletion',
        refetch: () => fetchDecisions(client, env.siteId, env.lists.decisions),
        commit: (decisions) => set({ decisions }),
      });
    },
  };
});
