import { describe, expect, it } from 'vitest';
import { baselineToCapture, resolveItemStatus, statusEventsFor } from './status';
import { makeEntry, makeItem } from '../test/fixtures';

const JULY = '2026-07-21';
const JUNE = '2026-06-16';

describe('resolveItemStatus', () => {
  it('reads the trail in event chronology, not the order rows were typed', () => {
    // The July meeting closed the project. The secretary then backfills
    // June, where it was still open.
    const item = makeItem({ id: 'i1', title: 'Chapel Awning', status: 'Closed' });
    const july = makeEntry({
      id: '10',
      itemId: 'i1',
      meetingDate: JULY,
      statusChangeTo: 'Closed',
    });
    const juneTypedLater = makeEntry({
      id: '11',
      itemId: 'i1',
      meetingDate: JUNE,
      statusChangeTo: 'Open',
    });

    const resolved = resolveItemStatus(item, [july, juneTypedLater]);

    expect(resolved.status).toBe('Closed');
    expect(resolved.basis).toBe('event');
    expect(resolved.source?.id).toBe('10');
    expect(resolved.on).toBe(JULY);
  });

  it('uses the pre-meeting update reported after the last meeting', () => {
    const item = makeItem({ id: 'i1', title: 'Roof Inspection', status: 'Open' });
    const augustOutcome = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: '2026-08-18',
      statusChangeTo: 'Open',
    });
    const septemberPremeeting = makeEntry({
      id: '2',
      itemId: 'i1',
      meetingDate: '2026-09-15',
      reportedDate: '2026-09-03',
      kind: 'Premeeting',
      statusChangeTo: 'Closed',
    });

    const resolved = resolveItemStatus(item, [septemberPremeeting, augustOutcome]);

    expect(resolved.status).toBe('Closed');
    expect(resolved.on).toBe('2026-09-03');
  });

  it('breaks a same-date tie for the meeting outcome over the pre-meeting note', () => {
    const item = makeItem({ id: 'i1', title: 'Shed Cleanout', status: 'Open' });
    const premeeting = makeEntry({
      id: '5',
      itemId: 'i1',
      meetingDate: JULY,
      reportedDate: JULY,
      kind: 'Premeeting',
      statusChangeTo: 'Open',
    });
    const outcome = makeEntry({
      id: '4',
      itemId: 'i1',
      meetingDate: JULY,
      statusChangeTo: 'Closed',
    });

    // Order of the input array must not matter.
    expect(resolveItemStatus(item, [premeeting, outcome]).status).toBe('Closed');
    expect(resolveItemStatus(item, [outcome, premeeting]).status).toBe('Closed');
  });

  it('breaks a same-date, same-kind tie by discussion order then record id', () => {
    const item = makeItem({ id: 'i1', title: 'K-Mac Invoice', status: 'Open' });
    const first = makeEntry({
      id: '7',
      itemId: 'i1',
      meetingDate: JULY,
      sortOrder: 10,
      statusChangeTo: 'Open',
    });
    const later = makeEntry({
      id: '8',
      itemId: 'i1',
      meetingDate: JULY,
      sortOrder: 20,
      statusChangeTo: 'Tabled',
    });
    expect(resolveItemStatus(item, [later, first]).status).toBe('Tabled');

    const sameOrderLowId = makeEntry({
      id: '9',
      itemId: 'i1',
      meetingDate: JULY,
      sortOrder: 20,
      statusChangeTo: 'Declined',
    });
    const sameOrderHighId = makeEntry({
      id: '10',
      itemId: 'i1',
      meetingDate: JULY,
      sortOrder: 20,
      statusChangeTo: 'Closed',
    });
    // Record 10 was written after record 9, so it wins — and "10" must
    // not lose to "9" on a string comparison.
    expect(resolveItemStatus(item, [sameOrderHighId, sameOrderLowId]).status).toBe('Closed');
    expect(resolveItemStatus(item, [sameOrderLowId, sameOrderHighId]).status).toBe('Closed');
  });

  it('ignores status events belonging to other projects', () => {
    const item = makeItem({ id: 'i1', title: 'Mine', status: 'Open' });
    const other = makeEntry({
      id: '1',
      itemId: 'i2',
      meetingDate: JULY,
      statusChangeTo: 'Closed',
    });
    expect(resolveItemStatus(item, [other]).basis).toBe('stored');
    expect(resolveItemStatus(item, [other]).status).toBe('Open');
  });

  it('falls back to the captured baseline when the sole status event is removed', () => {
    const item = makeItem({
      id: 'i1',
      title: 'Second Floor Water Fountain',
      status: 'Closed',
      baselineStatus: 'Open',
    });
    const resolved = resolveItemStatus(item, []);
    expect(resolved.status).toBe('Open');
    expect(resolved.basis).toBe('baseline');
  });

  it('falls back to the baseline when the sole status event is cleared, not deleted', () => {
    const item = makeItem({
      id: 'i1',
      title: 'Bradford Pear Removal',
      status: 'Closed',
      baselineStatus: 'Tabled',
    });
    const clearedEvent = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: JULY,
      narrative: 'Discussed, no decision.',
    });
    const resolved = resolveItemStatus(item, [clearedEvent]);
    expect(resolved.status).toBe('Tabled');
    expect(resolved.basis).toBe('baseline');
  });

  it('leaves a legacy record alone rather than reopening it', () => {
    // A 2025 project closed by hand, whose history nobody ever typed in.
    const item = makeItem({ id: 'i1', title: 'Cross Lights', status: 'Closed' });
    const resolved = resolveItemStatus(item, []);
    expect(resolved.status).toBe('Closed');
    expect(resolved.basis).toBe('stored');
  });
});

describe('statusEventsFor', () => {
  it('returns only status-changing entries for the project, oldest first', () => {
    const entries = [
      makeEntry({ id: '3', itemId: 'i1', meetingDate: JULY, statusChangeTo: 'Closed' }),
      makeEntry({ id: '2', itemId: 'i1', meetingDate: JUNE, narrative: 'No change' }),
      makeEntry({ id: '1', itemId: 'i1', meetingDate: '2026-05-19', statusChangeTo: 'Open' }),
      makeEntry({ id: '4', itemId: 'i2', meetingDate: JULY, statusChangeTo: 'Declined' }),
    ];
    expect(statusEventsFor('i1', entries).map((e) => e.id)).toEqual(['1', '3']);
  });
});

describe('baselineToCapture', () => {
  it('captures the current status before the first status event is written', () => {
    const item = makeItem({ id: 'i1', title: 'Roof', status: 'Tabled' });
    expect(baselineToCapture(item, [])).toBe('Tabled');
  });

  it('does not overwrite a baseline already recorded', () => {
    const item = makeItem({ id: 'i1', title: 'Roof', status: 'Closed', baselineStatus: 'Open' });
    expect(baselineToCapture(item, [])).toBeUndefined();
  });

  it('declines to guess once status events already exist', () => {
    const item = makeItem({ id: 'i1', title: 'Roof', status: 'Closed' });
    const existing = makeEntry({
      id: '1',
      itemId: 'i1',
      meetingDate: JUNE,
      statusChangeTo: 'Closed',
    });
    expect(baselineToCapture(item, [existing])).toBeUndefined();
  });
});
