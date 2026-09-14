import type { PublicClientApplication } from '@azure/msal-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphError } from '../graph/client';
import { SaveError } from './saveError';
import type { AppEnv } from '../env';

interface Row {
  id: string;
  fields: Record<string, unknown>;
}

const backend = vi.hoisted(() => ({
  rows: {} as Record<string, Row[]>,
  nextId: 100,
  creates: [] as Array<{ list: string; fields: Record<string, unknown> }>,
  patches: [] as Array<{ list: string; id: string; fields: Record<string, unknown> }>,
  /** Queued outcomes for the next creates: an error to throw, or null. */
  createOutcomes: [] as Array<unknown>,
  /** Errors to throw on the next fetches of a given list. */
  fetchFailures: {} as Record<string, unknown[]>,
  /** Errors to throw on the next patches of a given list. */
  patchFailures: {} as Record<string, unknown[]>,
  /** Runs inside createListItem, before it returns. */
  onCreate: null as null | ((list: string, fields: Record<string, unknown>) => void),
}));

vi.mock('../graph/api', async () => {
  const mappers = await import('../graph/mappers');

  const takeFetchFailure = (list: string) => {
    const queue = backend.fetchFailures[list];
    if (queue?.length) throw queue.shift();
  };

  const read = <T>(list: string, map: (row: Row) => T): Promise<T[]> => {
    takeFetchFailure(list);
    return Promise.resolve((backend.rows[list] ?? []).map((r) => map(structuredClone(r))));
  };

  return {
    ListMissingError: class ListMissingError extends Error {
      listName: string;
      constructor(listName: string) {
        super(listName);
        this.listName = listName;
      }
    },
    resolveListIds: async (_c: unknown, _s: string, names: readonly string[]) =>
      Object.fromEntries(names.map((n) => [n, n])),
    fetchItems: (_c: unknown, _s: string, list: string) =>
      read(list, (r) => mappers.mapItem(r)),
    fetchMeetings: (_c: unknown, _s: string, list: string) =>
      read(list, (r) => mappers.mapMeeting(r)),
    fetchMeetingEntries: (_c: unknown, _s: string, list: string) =>
      read(list, (r) => mappers.mapMeetingEntry(r)),
    fetchActionItems: (_c: unknown, _s: string, list: string) =>
      read(list, (r) => mappers.mapActionItem(r)),
    fetchDecisions: (_c: unknown, _s: string, list: string) =>
      read(list, (r) => mappers.mapDecision(r)),
    createListItem: async (
      _c: unknown,
      _s: string,
      list: string,
      fields: Record<string, unknown>,
    ) => {
      backend.creates.push({ list, fields: { ...fields } });
      backend.onCreate?.(list, fields);
      const outcome = backend.createOutcomes.shift();
      if (outcome) throw outcome;
      const id = String(backend.nextId++);
      (backend.rows[list] ??= []).push({ id, fields: { ...fields } });
      return { id };
    },
    patchListItemFields: async (
      _c: unknown,
      _s: string,
      list: string,
      itemId: string,
      fields: Record<string, unknown>,
    ) => {
      backend.patches.push({ list, id: itemId, fields: { ...fields } });
      const queue = backend.patchFailures[list];
      if (queue?.length) throw queue.shift();
      const row = (backend.rows[list] ?? []).find((r) => r.id === itemId);
      if (row) Object.assign(row.fields, fields);
    },
    deleteListItem: async (_c: unknown, _s: string, list: string, itemId: string) => {
      backend.rows[list] = (backend.rows[list] ?? []).filter((r) => r.id !== itemId);
    },
    isColumnKnownAbsent: () => false,
    forgetAbsentColumns: () => {},
  };
});

const { useStore } = await import('./useStore');

const ENV: AppEnv = {
  tenantId: 't',
  clientId: 'c',
  siteId: 'site',
  lists: {
    items: 'Items',
    meetings: 'Meetings',
    meetingEntries: 'MeetingEntries',
    decisions: 'Decisions',
    actionItems: 'ActionItems',
    vendors: 'Vendors',
  },
};

const JULY = '2026-07-21';
const JUNE = '2026-06-16';

function seedRow(list: string, id: string, fields: Record<string, unknown>) {
  (backend.rows[list] ??= []).push({ id, fields });
}

async function hydrate() {
  await useStore.getState().hydrate({} as PublicClientApplication, ENV);
  expect(useStore.getState().status).toBe('ready');
}

function statusPatches() {
  return backend.patches.filter((p) => p.list === 'Items' && 'Status' in p.fields);
}

function currentStatus(itemId: string): string | undefined {
  return useStore.getState().items.find((i) => i.id === itemId)?.status;
}

async function expectSaveError(promise: Promise<unknown>): Promise<SaveError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(SaveError);
    return err as SaveError;
  }
  throw new Error('Expected the save to report a problem.');
}

beforeEach(() => {
  useStore.getState().reset();
  backend.rows = {};
  backend.nextId = 100;
  backend.creates = [];
  backend.patches = [];
  backend.createOutcomes = [];
  backend.fetchFailures = {};
  backend.patchFailures = {};
  backend.onCreate = null;

  seedRow('Items', '1', { Title: 'Chapel Awning', Status: 'Open' });
  seedRow('Meetings', '10', { Title: `${JUNE} Regular`, MeetingDate: JUNE });
  seedRow('Meetings', '11', { Title: `${JULY} Regular`, MeetingDate: JULY });
});

describe('status history', () => {
  it('does not let a backfilled June entry undo what July recorded', async () => {
    await hydrate();

    await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'Project complete.',
      statusChangeTo: 'Closed',
    });
    expect(currentStatus('1')).toBe('Closed');

    // The secretary now types up June, where it was still open.
    await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '10',
      section: 'OldBusiness',
      narrative: 'Quote approved, not yet executed.',
      statusChangeTo: 'Open',
    });

    expect(currentStatus('1')).toBe('Closed');
    expect(statusPatches().map((p) => p.fields.Status)).toEqual(['Closed']);
  });

  it('captures the pre-tracking baseline with the first status event', async () => {
    await hydrate();
    await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'Tabled until the cash position improves.',
      statusChangeTo: 'Tabled',
    });

    const patch = statusPatches().at(-1);
    expect(patch?.fields).toMatchObject({ Status: 'Tabled', BaselineStatus: 'Open' });
  });

  it('restores the baseline when the only status event is deleted', async () => {
    await hydrate();
    const entry = await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'Closed out.',
      statusChangeTo: 'Closed',
    });
    expect(currentStatus('1')).toBe('Closed');

    await useStore.getState().deleteMeetingEntry(entry.id);

    expect(currentStatus('1')).toBe('Open');
  });

  it('restores the baseline when the only status event is cleared', async () => {
    await hydrate();
    const entry = await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'Closed out.',
      statusChangeTo: 'Closed',
    });

    await useStore.getState().updateMeetingEntry(entry.id, { statusChangeTo: null });

    expect(currentStatus('1')).toBe('Open');
  });

  it('follows the latest status event when it is edited', async () => {
    await hydrate();
    const entry = await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'Closed out.',
      statusChangeTo: 'Closed',
    });

    await useStore.getState().updateMeetingEntry(entry.id, { statusChangeTo: 'Declined' });

    expect(currentStatus('1')).toBe('Declined');
  });

  it('leaves a legacy record alone when no status event ever existed', async () => {
    seedRow('Items', '2', { Title: 'Cross Lights', Status: 'Closed' });
    await hydrate();

    await useStore.getState().reconcileItem('2');

    expect(currentStatus('2')).toBe('Closed');
    expect(statusPatches()).toHaveLength(0);
  });

  it('treats a pre-meeting update as the latest word on status', async () => {
    await hydrate();
    await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '10',
      section: 'OldBusiness',
      narrative: 'Still waiting.',
      statusChangeTo: 'Open',
    });
    await useStore.getState().addInterimUpdate({
      itemId: '1',
      meetingId: '11',
      narrative: 'Installed last week.',
      reportedDate: '2026-07-06',
      statusChangeTo: 'Closed',
    });

    expect(currentStatus('1')).toBe('Closed');
    const created = backend.creates.at(-1)?.fields;
    expect(created).toMatchObject({ EntryKind: 'Premeeting', ReportedDate: '2026-07-06' });
  });
});

describe('interrupted saves', () => {
  it('reports a rejected write as nothing saved, and lets the form retry', async () => {
    await hydrate();
    backend.createOutcomes = [new GraphError('Invalid request', 400, 'invalidRequest')];

    const err = await expectSaveError(
      useStore.getState().createMeetingEntry({
        itemId: '1',
        meetingId: '11',
        section: 'OldBusiness',
        narrative: 'Nope.',
      }),
    );

    expect(err.outcome).toBe('not-saved');
    expect(err.resubmitSafe).toBe(true);
    expect(useStore.getState().meetingEntries).toHaveLength(0);
  });

  it('reports a saved record whose status update failed, and finishes it on resume', async () => {
    await hydrate();
    backend.patchFailures.Items = [new Error('network down')];

    const err = await expectSaveError(
      useStore.getState().createMeetingEntry({
        itemId: '1',
        meetingId: '11',
        section: 'OldBusiness',
        narrative: 'Project complete.',
        statusChangeTo: 'Closed',
      }),
    );

    expect(err.outcome).toBe('saved-incomplete');
    expect(err.recordId).toBeDefined();
    expect(err.resubmitSafe).toBe(false);
    // The entry itself is safely recorded and on screen.
    expect(useStore.getState().meetingEntries).toHaveLength(1);
    expect(currentStatus('1')).toBe('Open');

    await err.resume!();

    expect(currentStatus('1')).toBe('Closed');
    // Only ever one POST.
    expect(backend.creates.filter((c) => c.list === 'MeetingEntries')).toHaveLength(1);
  });

  it('reports a saved record whose refresh failed, and reloads on resume', async () => {
    await hydrate();
    backend.fetchFailures.MeetingEntries = [new Error('connection reset')];

    const err = await expectSaveError(
      useStore.getState().createMeetingEntry({
        itemId: '1',
        meetingId: '11',
        section: 'OldBusiness',
        narrative: 'Recorded but not reloaded.',
      }),
    );

    expect(err.outcome).toBe('saved-incomplete');
    expect(useStore.getState().meetingEntries).toHaveLength(0);

    await err.resume!();

    expect(useStore.getState().meetingEntries).toHaveLength(1);
    expect(backend.creates.filter((c) => c.list === 'MeetingEntries')).toHaveLength(1);
  });

  it('checks SharePoint after an ambiguous failure instead of posting again', async () => {
    await hydrate();
    // The row lands, then the connection drops before the reply arrives.
    backend.onCreate = (list, fields) => {
      if (list !== 'MeetingEntries') return;
      seedRow(list, '999', { ...fields });
    };
    backend.createOutcomes = [new TypeError('Failed to fetch')];

    const entry = await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'Landed despite the dropped connection.',
      statusChangeTo: 'Closed',
    });

    expect(entry.id).toBe('999');
    expect(backend.creates.filter((c) => c.list === 'MeetingEntries')).toHaveLength(1);
    expect(useStore.getState().meetingEntries).toHaveLength(1);
    expect(currentStatus('1')).toBe('Closed');
  });

  it('says plainly when an ambiguous failure saved nothing', async () => {
    await hydrate();
    backend.createOutcomes = [new TypeError('Failed to fetch')];

    const err = await expectSaveError(
      useStore.getState().createMeetingEntry({
        itemId: '1',
        meetingId: '11',
        section: 'OldBusiness',
        narrative: 'Never arrived.',
      }),
    );

    expect(err.outcome).toBe('not-saved');
    expect(err.resubmitSafe).toBe(true);
    expect(useStore.getState().meetingEntries).toHaveLength(0);
  });

  it('holds off on a retry while it cannot tell whether the record exists', async () => {
    await hydrate();
    backend.onCreate = (list, fields) => {
      if (list !== 'MeetingEntries') return;
      seedRow(list, '999', { ...fields });
    };
    backend.createOutcomes = [new TypeError('Failed to fetch')];
    backend.fetchFailures.MeetingEntries = [new TypeError('Failed to fetch')];

    const err = await expectSaveError(
      useStore.getState().createMeetingEntry({
        itemId: '1',
        meetingId: '11',
        section: 'OldBusiness',
        narrative: 'Unknown fate.',
        statusChangeTo: 'Closed',
      }),
    );

    expect(err.outcome).toBe('unconfirmed');
    expect(err.resubmitSafe).toBe(false);
    expect(err.recovery).toContain('Do not re-type it yet');

    // Once the network is back, resuming reconciles rather than re-posting.
    await err.resume!();

    expect(backend.creates.filter((c) => c.list === 'MeetingEntries')).toHaveLength(1);
    expect(useStore.getState().meetingEntries).toHaveLength(1);
    expect(currentStatus('1')).toBe('Closed');
  });

  it('refuses a second submission of the same update while the first is in flight', async () => {
    await hydrate();
    const input = {
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness' as const,
      narrative: 'Double tap.',
    };

    // Press Save twice without waiting — the second press must not
    // reach SharePoint.
    const first = useStore.getState().createMeetingEntry(input);
    const err = await expectSaveError(useStore.getState().createMeetingEntry(input));
    await first;

    expect(err.outcome).toBe('already-saving');
    expect(err.resubmitSafe).toBe(false);
    expect(backend.creates.filter((c) => c.list === 'MeetingEntries')).toHaveLength(1);
    expect(useStore.getState().meetingEntries).toHaveLength(1);
  });

  it('frees the guard once the save finishes, so a real second entry still saves', async () => {
    await hydrate();
    await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'First point.',
    });
    await useStore.getState().createMeetingEntry({
      itemId: '1',
      meetingId: '11',
      section: 'OldBusiness',
      narrative: 'Second point.',
    });
    expect(useStore.getState().meetingEntries).toHaveLength(2);
  });

  it('applies the same treatment to action items', async () => {
    await hydrate();
    seedRow('MeetingEntries', '50', {
      Title: 'entry',
      MeetingIdLookupId: 11,
      MeetingDate: JULY,
      ItemIdLookupId: 1,
      Section: 'OldBusiness',
      SortOrder: 10,
    });
    backend.fetchFailures.ActionItems = [new Error('connection reset')];

    const err = await expectSaveError(
      useStore.getState().createActionItem({
        meetingEntryId: '50',
        itemId: '1',
        meetingId: '11',
        description: 'Order the grab bars',
        assignee: 'Scott Bragg',
      }),
    );

    expect(err.outcome).toBe('saved-incomplete');
    await err.resume!();
    expect(useStore.getState().actionItems).toHaveLength(1);
    expect(backend.creates.filter((c) => c.list === 'ActionItems')).toHaveLength(1);
  });
});
