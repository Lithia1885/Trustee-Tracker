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

  it('honors explicit DefaultSection over standing/auto inference', () => {
    const items = [
      item({ id: 'a', title: 'Forced new', defaultSection: 'NewBusiness', standing: true }),
      item({ id: 'b', title: 'Forced update', defaultSection: 'Update' }),
      item({ id: 'c', title: 'Forced old', defaultSection: 'OldBusiness' }),
    ];
    const agenda = generateAgenda(items, [], TARGET);
    expect(agenda.newBusiness.map((e) => e.item.id)).toEqual(['a']);
    expect(agenda.updates.map((e) => e.item.id)).toEqual(['b']);
    expect(agenda.oldBusiness.map((e) => e.item.id)).toEqual(['c']);
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
