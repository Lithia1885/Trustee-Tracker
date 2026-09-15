import { describe, expect, it } from 'vitest';
import { generateAgenda } from './generator';
import type { Item, MeetingEntry } from '../types';

const TARGET = '2026-05-19';

function item(overrides: Partial<Item> & { id: string; title: string }): Item {
  return {
    status: 'Open',
    standing: false,
    defaultSection: 'Auto',
    tags: [],
    ...overrides,
  };
}

function entry(
  overrides: Partial<MeetingEntry> & { id: string; itemId: string; meetingDate: string },
): MeetingEntry {
  return {
    title: `${overrides.meetingDate} — entry`,
    meetingId: `m-${overrides.meetingDate}`,
    section: 'OldBusiness',
    sortOrder: 100,
    kind: 'InMeeting',
    ...overrides,
  };
}

describe('generateAgenda', () => {
  it('skips Closed and Declined items', () => {
    const items = [
      item({ id: 'a', title: 'Closed item', status: 'Closed' }),
      item({ id: 'b', title: 'Declined item', status: 'Declined' }),
      item({ id: 'c', title: 'Open item' }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['c']);
    expect(agenda.oldBusiness).toHaveLength(0);
    expect(agenda.tabled).toHaveLength(0);
  });

  it('skips items with deferredUntil after the target date', () => {
    const items = [
      item({ id: 'a', title: 'Deferred', deferredUntil: '2026-06-01' }),
      item({ id: 'b', title: 'Not deferred' }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['b']);
  });

  it('includes items whose deferredUntil is on or before the target date', () => {
    const items = [item({ id: 'a', title: 'Released today', deferredUntil: TARGET })];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['a']);
  });

  it('routes Tabled status to Tabled section', () => {
    const items = [item({ id: 'a', title: 'Tabled item', status: 'Tabled' })];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.tabled.map((e) => e.item.id)).toEqual(['a']);
    expect(agenda.oldBusiness).toHaveLength(0);
  });

  it('routes items with onHoldReason to Tabled section even when status is Open', () => {
    const items = [
      item({ id: 'a', title: 'On hold', onHoldReason: 'Pending finance review' }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.tabled.map((e) => e.item.id)).toEqual(['a']);
  });

  it('honors explicit DefaultSection over auto inference', () => {
    const items = [
      item({ id: 'a', title: 'Forced new', defaultSection: 'NewBusiness' }),
      item({ id: 'b', title: 'Forced update', defaultSection: 'Update' }),
      item({ id: 'c', title: 'Forced old', defaultSection: 'OldBusiness' }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['a']);
    expect(agenda.updates.map((e) => e.item.id)).toEqual(['b']);
    expect(agenda.oldBusiness.map((e) => e.item.id)).toEqual(['c']);
  });

  it('puts a standing item in Updates even when pinned elsewhere', () => {
    // A standing item is a recurring report, not a piece of work with an
    // end state — a treasury report does not belong in Old Business.
    const items = [
      item({ id: 'a', title: 'Treasury', defaultSection: 'OldBusiness', standing: true }),
      item({ id: 'b', title: 'Pinned new', defaultSection: 'NewBusiness', standing: true }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    // Neither has a prior entry, so they alphabetize by title.
    expect(agenda.updates.map((e) => e.item.title)).toEqual(['Pinned new', 'Treasury']);
    expect(agenda.oldBusiness).toHaveLength(0);
    expect(agenda.newBusiness).toHaveLength(0);
  });

  it('keeps Open Discussion at the end, even when it is standing', () => {
    const items = [
      item({ id: 'a', title: 'Open Discussion', defaultSection: 'OtherBusiness', standing: true }),
      item({ id: 'b', title: 'A standing report', standing: true }),
    ];
    const entries = [entry({ id: 'e1', itemId: 'a', meetingDate: '2026-04-21' })];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.otherBusiness.map((e) => e.item.id)).toEqual(['a']);
    expect(agenda.updates.map((e) => e.item.id)).toEqual(['b']);
    expect(agenda.oldBusiness).toHaveLength(0);
  });

  it('routes a tabled Open Discussion item to Tabled, not to the end slot', () => {
    const items = [
      item({
        id: 'a',
        title: 'Open Discussion',
        defaultSection: 'OtherBusiness',
        status: 'Tabled',
      }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.tabled.map((e) => e.item.id)).toEqual(['a']);
    expect(agenda.otherBusiness).toHaveLength(0);
  });

  it('puts Auto + standing items in Updates', () => {
    const items = [item({ id: 'a', title: 'Standing thing', standing: true })];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.updates.map((e) => e.item.id)).toEqual(['a']);
  });

  it('puts Auto + no prior entries in New Business', () => {
    const items = [item({ id: 'a', title: 'Brand new' })];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['a']);
  });

  it('puts Auto + prior entries in Old Business', () => {
    const items = [item({ id: 'a', title: 'Carried over' })];
    const entries = [entry({ id: 'e1', itemId: 'a', meetingDate: '2026-04-21' })];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.oldBusiness.map((e) => e.item.id)).toEqual(['a']);
    expect(agenda.newBusiness).toHaveLength(0);
  });

  it('ignores entries on or after the target date when classifying', () => {
    const items = [item({ id: 'a', title: 'Future entry only' })];
    const entries = [entry({ id: 'e1', itemId: 'a', meetingDate: TARGET })];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['a']);
  });

  it('orders within section by most recent prior entry sortOrder', () => {
    const items = [
      item({ id: 'a', title: 'Apple' }),
      item({ id: 'b', title: 'Banana' }),
      item({ id: 'c', title: 'Cherry' }),
    ];
    const entries = [
      entry({ id: 'e1', itemId: 'a', meetingDate: '2026-04-21', sortOrder: 30 }),
      entry({ id: 'e2', itemId: 'b', meetingDate: '2026-04-21', sortOrder: 10 }),
      entry({ id: 'e3', itemId: 'c', meetingDate: '2026-04-21', sortOrder: 20 }),
    ];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.oldBusiness.map((e) => e.item.id)).toEqual(['b', 'c', 'a']);
  });

  it('uses the most recent prior entry sortOrder, not older ones', () => {
    const items = [item({ id: 'a', title: 'A' }), item({ id: 'b', title: 'B' })];
    const entries = [
      entry({ id: 'e1', itemId: 'a', meetingDate: '2026-03-17', sortOrder: 10 }),
      entry({ id: 'e2', itemId: 'a', meetingDate: '2026-04-21', sortOrder: 90 }),
      entry({ id: 'e3', itemId: 'b', meetingDate: '2026-04-21', sortOrder: 50 }),
    ];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.oldBusiness.map((e) => e.item.id)).toEqual(['b', 'a']);
  });

  it('places items without prior entries after items with priors, alphabetized', () => {
    const items = [
      item({ id: 'a', title: 'Zucchini', defaultSection: 'OldBusiness' }),
      item({ id: 'b', title: 'Apricot', defaultSection: 'OldBusiness' }),
      item({ id: 'c', title: 'Cherry', defaultSection: 'OldBusiness' }),
    ];
    const entries = [entry({ id: 'e1', itemId: 'c', meetingDate: '2026-04-21', sortOrder: 10 })];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.oldBusiness.map((e) => e.item.id)).toEqual(['c', 'b', 'a']);
  });

  it('reports lastDiscussedDate and priorEntryCount on entries', () => {
    const items = [item({ id: 'a', title: 'A' })];
    const entries = [
      entry({ id: 'e1', itemId: 'a', meetingDate: '2026-03-17' }),
      entry({ id: 'e2', itemId: 'a', meetingDate: '2026-04-21' }),
    ];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.oldBusiness[0].lastDiscussedDate).toBe('2026-04-21');
    expect(agenda.oldBusiness[0].priorEntryCount).toBe(2);
  });
});

describe('generateAgenda — updates between meetings', () => {
  const SEPT = '2026-09-15';

  it('prints a pre-meeting update on the agenda it was attached to', () => {
    const items = [item({ id: 'a', title: 'Elevator Phone' })];
    const entries = [
      entry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-08-18',
        narrative: 'Waiting on the vendor.',
      }),
      entry({
        id: 'e2',
        itemId: 'a',
        meetingDate: SEPT,
        reportedDate: '2026-09-03',
        kind: 'Premeeting',
        narrative: 'Contractor confirmed for September 24.',
      }),
    ];
    const agenda = generateAgenda(items, entries, SEPT);
    expect(agenda.oldBusiness[0].summary?.text).toBe('Contractor confirmed for September 24.');
  });

  it('keeps a meeting outcome out of that meeting’s own agenda', () => {
    const items = [item({ id: 'a', title: 'Elevator Phone' })];
    const entries = [
      entry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-08-18',
        narrative: 'Waiting on the vendor.',
      }),
      entry({ id: 'e2', itemId: 'a', meetingDate: SEPT, narrative: 'Installed and tested.' }),
    ];
    const agenda = generateAgenda(items, entries, SEPT);
    expect(agenda.oldBusiness[0].summary?.text).toBe('Waiting on the vendor.');
  });

  it('treats a project first reported between meetings as new business', () => {
    const items = [item({ id: 'a', title: 'Kitchen Door Leak' })];
    const entries = [
      entry({
        id: 'e1',
        itemId: 'a',
        meetingDate: SEPT,
        reportedDate: '2026-09-02',
        kind: 'Premeeting',
        narrative: 'Water under the entry rug.',
      }),
    ];
    const agenda = generateAgenda(items, entries, SEPT);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['a']);
    expect(agenda.oldBusiness).toHaveLength(0);
    expect(agenda.newBusiness[0].summary?.text).toBe('Water under the entry rug.');
    expect(agenda.newBusiness[0].priorEntryCount).toBe(0);
  });

  it('falls back to background notes when no update applies', () => {
    const items = [item({ id: 'a', title: 'Roof Inspection', notes: 'Shingles bubbling.' })];
    const agenda = generateAgenda(items, [], SEPT);
    expect(agenda.newBusiness[0].summary?.text).toBe('Shingles bubbling.');
    expect(agenda.newBusiness[0].summary?.source).toBe('background');
  });
});

describe('generateAgenda — deferred projects', () => {
  it('keeps a deferred project out of the agenda but reports it separately', () => {
    const items = [
      item({
        id: 'a',
        title: 'Chapel Awning',
        deferredUntil: '2026-06-01',
        onHoldReason: 'Waiting on the cash position.',
      }),
      item({ id: 'b', title: 'Roof Inspection' }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['b']);
    expect(agenda.tabled).toHaveLength(0);
    expect(agenda.deferred.map((e) => e.item.id)).toEqual(['a']);
  });

  it('leaves the deferred list empty once the revisit date arrives', () => {
    const items = [item({ id: 'a', title: 'Chapel Awning', deferredUntil: TARGET })];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.deferred).toHaveLength(0);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['a']);
  });
});

describe('generateAgenda — status comes from the event trail', () => {
  it('places by the resolved status, not by a drifted cached column', () => {
    // The cached column still says Open; the history says the project
    // was closed in July. The agenda must agree with the reconciler.
    const items = [item({ id: 'a', title: 'Drifted', status: 'Open' })];
    const entries = [
      entry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-04-21',
        statusChangeTo: 'Closed',
        narrative: 'Finished.',
      }),
    ];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.oldBusiness).toHaveLength(0);
    expect(agenda.newBusiness).toHaveLength(0);
    expect(agenda.tabled).toHaveLength(0);
  });

  it('reports the resolved status on the entry it produces', () => {
    const items = [item({ id: 'a', title: 'Drifted to tabled', status: 'Open' })];
    const entries = [
      entry({ id: 'e1', itemId: 'a', meetingDate: '2026-04-21', statusChangeTo: 'Tabled' }),
    ];
    const agenda = generateAgenda(items, entries, TARGET);
    expect(agenda.tabled[0].status).toBe('Tabled');
  });
});

describe('generateAgenda — narrative age', () => {
  it('flags a summary older than two meeting cycles', () => {
    const items = [item({ id: 'a', title: 'Shed Cleanout' })];
    const entries = [
      entry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-04-21',
        narrative: 'Art and Kevin meeting Saturday.',
      }),
    ];
    const agenda = generateAgenda(items, entries, '2026-09-15');
    expect(agenda.oldBusiness[0].stale).toBe(true);
  });

  it('does not flag last month, or the month before that', () => {
    const items = [item({ id: 'a', title: 'Recent' }), item({ id: 'b', title: 'Two cycles' })];
    const entries = [
      entry({ id: 'e1', itemId: 'a', meetingDate: '2026-08-18', narrative: 'Fresh.' }),
      entry({ id: 'e2', itemId: 'b', meetingDate: '2026-07-21', narrative: 'Still current.' }),
    ];
    const agenda = generateAgenda(items, entries, '2026-09-15');
    expect(agenda.oldBusiness.map((e) => e.stale)).toEqual([false, false]);
  });

  it('never flags background notes, which carry no date', () => {
    const items = [item({ id: 'a', title: 'Never discussed', notes: 'Background only.' })];
    const agenda = generateAgenda(items, [], '2026-09-15');
    expect(agenda.newBusiness[0].stale).toBe(false);
    expect(agenda.newBusiness[0].summary?.source).toBe('background');
  });
});
