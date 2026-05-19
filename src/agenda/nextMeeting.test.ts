import { describe, expect, it } from 'vitest';
import { nextThirdTuesday, toIsoDate } from './nextMeeting';

describe('nextThirdTuesday', () => {
  it('returns this month before meeting day', () => {
    const d = new Date(2026, 4, 1, 10, 0, 0);
    expect(toIsoDate(nextThirdTuesday(d))).toBe('2026-05-19');
  });

  it('returns this month on meeting day, even after work hours', () => {
    const morning = new Date(2026, 4, 19, 7, 0, 0);
    const evening = new Date(2026, 4, 19, 22, 0, 0);
    expect(toIsoDate(nextThirdTuesday(morning))).toBe('2026-05-19');
    expect(toIsoDate(nextThirdTuesday(evening))).toBe('2026-05-19');
  });

  it('rolls to next month the day after meeting day', () => {
    const d = new Date(2026, 4, 20, 6, 0, 0);
    expect(toIsoDate(nextThirdTuesday(d))).toBe('2026-06-16');
  });

  it('crosses year boundary the day after December meeting', () => {
    const onMeetingDay = new Date(2026, 11, 15, 22, 0, 0);
    expect(toIsoDate(nextThirdTuesday(onMeetingDay))).toBe('2026-12-15');
    const dayAfter = new Date(2026, 11, 16, 6, 0, 0);
    expect(toIsoDate(nextThirdTuesday(dayAfter))).toBe('2027-01-19');
  });
});
