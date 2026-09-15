import { describe, expect, it } from 'vitest';
import { isDueHintPastDue, parseDueDate } from './dueHint';

const MEETING = '2026-09-15';

describe('parseDueDate', () => {
  it('reads a bare ISO date', () => {
    expect(parseDueDate('2026-09-01', MEETING)).toBe('2026-09-01');
  });

  it('reads an ISO date buried in the board’s own wording', () => {
    expect(parseDueDate('Before spec package release ~2026-09-01', MEETING)).toBe('2026-09-01');
    expect(parseDueDate('Before 2026-12-01', MEETING)).toBe('2026-12-01');
  });

  it('reads a written month and day, taking the meeting’s year when none is given', () => {
    expect(parseDueDate('before May 19', MEETING)).toBe('2026-05-19');
    expect(parseDueDate('Sept 8, 2027', MEETING)).toBe('2027-09-08');
    expect(parseDueDate('September 8 2027', MEETING)).toBe('2027-09-08');
  });

  it('reads a slashed date', () => {
    expect(parseDueDate('9/1/2026', MEETING)).toBe('2026-09-01');
  });

  it('says nothing about wording that names no date', () => {
    for (const hint of ['next meeting', 'after Easter', 'On completion of back lot', '', undefined]) {
      expect(parseDueDate(hint, MEETING)).toBeUndefined();
    }
  });

  it('refuses an impossible date rather than guessing', () => {
    expect(parseDueDate('2026-13-01', MEETING)).toBeUndefined();
  });
});

describe('isDueHintPastDue', () => {
  it('marks a parsed date that has gone by', () => {
    expect(isDueHintPastDue('2026-09-01', MEETING)).toBe(true);
    expect(isDueHintPastDue('Before spec package release ~2026-09-01', MEETING)).toBe(true);
  });

  it('leaves a future date alone', () => {
    expect(isDueHintPastDue('Before 2026-12-01', MEETING)).toBe(false);
  });

  it('leaves the meeting day itself alone', () => {
    expect(isDueHintPastDue('2026-09-15', MEETING)).toBe(false);
  });

  it('never calls free text late', () => {
    expect(isDueHintPastDue('next meeting', MEETING)).toBe(false);
    expect(isDueHintPastDue('On completion of back lot', MEETING)).toBe(false);
    expect(isDueHintPastDue(undefined, MEETING)).toBe(false);
  });
});
