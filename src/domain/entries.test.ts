import { describe, expect, it } from 'vitest';
import {
  effectiveDate,
  isPriorMeetingOutcome,
  isVisibleOnAgenda,
  selectStatusSummary,
  sortedChronologically,
} from './entries';
import { makeEntry, makeItem } from '../test/fixtures';

const SEPTEMBER = '2026-09-15';
const AUGUST = '2026-08-18';

describe('effectiveDate', () => {
  it('uses the meeting date when nothing was reported separately', () => {
    expect(effectiveDate(makeEntry({ id: '1', itemId: 'i1', meetingDate: AUGUST }))).toBe(AUGUST);
  });

  it('uses the reported date when one is recorded', () => {
    const entry = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: SEPTEMBER,
      reportedDate: '2026-09-02',
      kind: 'Premeeting',
    });
    expect(effectiveDate(entry)).toBe('2026-09-02');
  });
});

describe('isVisibleOnAgenda', () => {
  it('carries a pre-meeting update onto the agenda it is attached to', () => {
    const update = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: SEPTEMBER,
      reportedDate: '2026-09-02',
      kind: 'Premeeting',
    });
    expect(isVisibleOnAgenda(update, SEPTEMBER)).toBe(true);
  });

  it('keeps a meeting outcome off that meeting’s own agenda', () => {
    const outcome = makeEntry({ id: '1', itemId: 'i1', meetingDate: SEPTEMBER });
    expect(isVisibleOnAgenda(outcome, SEPTEMBER)).toBe(false);
    expect(isVisibleOnAgenda(outcome, '2026-10-20')).toBe(true);
  });

  it('never shows an update on an agenda that predates it', () => {
    const update = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: SEPTEMBER,
      reportedDate: '2026-09-02',
      kind: 'Premeeting',
    });
    expect(isVisibleOnAgenda(update, AUGUST)).toBe(false);
  });

  it('holds back a pre-meeting row reported after the meeting it is filed under', () => {
    // Entered late and misfiled onto the September meeting; it must not
    // appear on the September agenda as if it were known beforehand.
    const late = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: SEPTEMBER,
      reportedDate: '2026-09-20',
      kind: 'Premeeting',
    });
    expect(isVisibleOnAgenda(late, SEPTEMBER)).toBe(false);
    expect(isVisibleOnAgenda(late, '2026-10-20')).toBe(true);
  });
});

describe('isPriorMeetingOutcome', () => {
  it('counts outcomes of earlier meetings', () => {
    const outcome = makeEntry({ id: '1', itemId: 'i1', meetingDate: AUGUST });
    expect(isPriorMeetingOutcome(outcome, SEPTEMBER)).toBe(true);
  });

  it('does not count a pre-meeting update as a prior discussion', () => {
    // Raised by email in September; it is still new business in September.
    const update = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: SEPTEMBER,
      reportedDate: '2026-09-02',
      kind: 'Premeeting',
    });
    expect(isPriorMeetingOutcome(update, SEPTEMBER)).toBe(false);
  });
});

describe('sortedChronologically', () => {
  it('orders by when things happened, regardless of input order', () => {
    const entries = [
      makeEntry({ id: '3', itemId: 'i1', meetingDate: '2026-10-20' }),
      makeEntry({
        id: '1',
        itemId: 'i1',
        meetingDate: '2026-10-20',
        reportedDate: '2026-09-30',
        kind: 'Premeeting',
      }),
      makeEntry({ id: '2', itemId: 'i1', meetingDate: SEPTEMBER }),
    ];
    expect(sortedChronologically(entries).map((e) => e.id)).toEqual(['2', '1', '3']);
  });
});

describe('selectStatusSummary', () => {
  const item = makeItem({
    id: 'i1',
    title: 'Elevator Emergency Phone',
    notes: 'Approved March 2026. Dual-path, 16-hour battery.',
  });

  it('prefers the most recent update the board could have had', () => {
    const august = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: AUGUST,
      narrative: 'Waiting on the vendor.',
    });
    const septemberPremeeting = makeEntry({
      id: '2',
      itemId: 'i1',
      meetingDate: SEPTEMBER,
      reportedDate: '2026-09-03',
      kind: 'Premeeting',
      narrative: 'Contractor confirmed for September 24.',
    });

    const summary = selectStatusSummary(item, [august, septemberPremeeting], SEPTEMBER);

    expect(summary?.text).toBe('Contractor confirmed for September 24.');
    expect(summary?.source).toBe('update');
    expect(summary?.date).toBe('2026-09-03');
  });

  it('does not let a later meeting’s outcome leak into an earlier agenda', () => {
    const august = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: AUGUST,
      narrative: 'Waiting on the vendor.',
    });
    const september = makeEntry({
      id: '2',
      itemId: 'i1',
      meetingDate: SEPTEMBER,
      narrative: 'Installed and tested.',
    });

    const summary = selectStatusSummary(item, [august, september], SEPTEMBER);
    expect(summary?.text).toBe('Waiting on the vendor.');
  });

  it('falls back to the background notes when no update applies yet', () => {
    const summary = selectStatusSummary(item, [], SEPTEMBER);
    expect(summary?.text).toBe('Approved March 2026. Dual-path, 16-hour battery.');
    expect(summary?.source).toBe('background');
  });

  it('skips entries with no narrative rather than showing a blank', () => {
    const silent = makeEntry({ id: '2', itemId: 'i1', meetingDate: AUGUST, narrative: '   ' });
    const older = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: '2026-07-21',
      narrative: 'Contract stalled over an address correction.',
    });
    const summary = selectStatusSummary(item, [silent, older], SEPTEMBER);
    expect(summary?.text).toBe('Contract stalled over an address correction.');
  });

  it('returns nothing when there is neither an update nor background notes', () => {
    const bare = makeItem({ id: 'i2', title: 'Bare project' });
    expect(selectStatusSummary(bare, [], SEPTEMBER)).toBeUndefined();
  });
});
