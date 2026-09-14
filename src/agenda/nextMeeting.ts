export function thirdTuesdayOf(year: number, monthIndex: number): Date {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const dayOfWeek = first.getUTCDay();
  const offsetToFirstTuesday = (2 - dayOfWeek + 7) % 7;
  const day = 1 + offsetToFirstTuesday + 14;
  return new Date(Date.UTC(year, monthIndex, day));
}

export function nextThirdTuesday(today: Date): Date {
  // Compare by the user's local calendar date so the agenda holds on
  // meeting day itself and only rolls over the morning after.
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const todayUtcMidnight = Date.UTC(y, m, d);
  const thisMonth = thirdTuesdayOf(y, m);
  if (thisMonth.getTime() >= todayUtcMidnight) return thisMonth;
  return thirdTuesdayOf(m === 11 ? y + 1 : y, (m + 1) % 12);
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * The regular meeting that follows `date`.
 *
 * `nextThirdTuesday` deliberately holds on meeting day itself, so that
 * the app keeps showing today's agenda all day. A printed agenda has to
 * look past it: the packet handed out on May 19 must not say the next
 * meeting is May 19.
 */
export function thirdTuesdayAfter(date: Date): Date {
  const dayAfter = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return nextThirdTuesday(dayAfter);
}
