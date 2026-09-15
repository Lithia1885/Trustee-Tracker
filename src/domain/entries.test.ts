import { describe, expect, it } from 'vitest';
import {
  effectiveDate,
  isPriorMeetingOutcome,
  isSummaryStale,
  isVisibleOnAgenda,
  monthsBetween,
  selectStatusSummary,
  sortedChronologically,
  summarizeNarrative,
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

describe('monthsBetween', () => {
  it('counts month boundaries, not elapsed days', () => {
    expect(monthsBetween('2026-04-21', '2026-09-15')).toBe(5);
    expect(monthsBetween('2026-08-18', '2026-09-15')).toBe(1);
    expect(monthsBetween('2026-09-30', '2026-09-01')).toBe(0);
  });

  it('crosses the year boundary', () => {
    expect(monthsBetween('2025-11-18', '2026-01-19')).toBe(2);
  });
});

describe('isSummaryStale', () => {
  const summary = (date?: string, source: 'update' | 'background' = 'update') => ({
    text: 'Art and Kevin meeting Saturday.',
    source,
    date,
  });

  it('flags an April narrative on a September agenda', () => {
    expect(isSummaryStale(summary('2026-04-21'), '2026-09-15')).toBe(true);
  });

  it('leaves the last two cycles alone', () => {
    expect(isSummaryStale(summary('2026-08-18'), '2026-09-15')).toBe(false);
    expect(isSummaryStale(summary('2026-07-21'), '2026-09-15')).toBe(false);
  });

  it('flags the third cycle back', () => {
    expect(isSummaryStale(summary('2026-06-16'), '2026-09-15')).toBe(true);
  });

  it('says nothing about a summary with no date behind it', () => {
    expect(isSummaryStale(summary(undefined, 'background'), '2026-09-15')).toBe(false);
    expect(isSummaryStale(undefined, '2026-09-15')).toBe(false);
  });
});

describe('summarizeNarrative', () => {
  it('leaves a short narrative exactly as written', () => {
    const short = 'No update in April. Invoice dispute ($7K) remains open.';
    expect(summarizeNarrative(short)).toBe(short);
  });

  it('cuts a long narrative at its first real sentence', () => {
    const long =
      'Harness acquired by MozartWorks; the original founder repurchased the services division. ' +
      'Contract, billing and 1 January end date unchanged. Two meetings held, 11 and 17 August, ' +
      'attended by Scott Bragg, Pastor Long and Bart Arther. The vendor acknowledged that the ' +
      'engagement had become formulaic and had not delivered on raising funds outside the church.';
    expect(summarizeNarrative(long, { maxChars: 190, minSentence: 50, maxSentence: 230 })).toBe(
      'Harness acquired by MozartWorks; the original founder repurchased the services division.',
    );
  });

  it('falls back to a clean cut when no sentence ends in range', () => {
    const runOn = 'word '.repeat(80).trim();
    const out = summarizeNarrative(runOn, { maxChars: 100 });
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('…')).toBe(true);
  });

  it('reads only the first paragraph, and strips the markdown off it', () => {
    const md = '**Bold** lead sentence.\n\nA second paragraph nobody needs here.';
    expect(summarizeNarrative(md)).toBe('Bold lead sentence.');
  });
});

// The board writes its narratives as a story: why the matter came up,
// what was said, then what was done about it. Summarising by taking the
// opening sentence therefore returned the least useful sentence there
// was — the furniture item opened on why a called meeting was held and
// closed on the September sale being cancelled.
describe('summarizeNarrative — finding the outcome', () => {
  const PAPER = { maxChars: 190, minSentence: 50, maxSentence: 230 };

  const furniture =
    'Called meeting following the morning service to address disposition of the ' +
    'children\u2019s wing furniture in light of two requests received since the August meeting. ' +
    'Motion by Bill Camp, second by Pat Smith to offer the furniture to the first requester ' +
    'at no charge; carried unanimously. The 18\u201319 September sale was canceled.';

  it('surfaces the decision when the narrative ends on it', () => {
    expect(summarizeNarrative(furniture, PAPER)).toContain('sale was canceled.');
  });

  it('keeps the opening in front of it, because a decision has no subject', () => {
    const out = summarizeNarrative(furniture, PAPER);
    expect(out.startsWith('Called meeting following the morning service')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(PAPER.maxChars);
  });

  it('elides the opening on a word, never on a dangling article', () => {
    const out = summarizeNarrative(furniture, PAPER);
    expect(out).not.toMatch(/\b(?:the|a|an|of|to|since|and)\u2026/);
    expect(out).toContain('\u2026');
  });

  it('takes the last decision, not the first', () => {
    // Both sentences are decisions; only the second is still true.
    const out = summarizeNarrative(furniture, PAPER);
    expect(out).not.toContain('Motion by Bill Camp');
  });

  it('drops the opening when there is no room for any of it', () => {
    // An elided opening that is only a word or two long tells nobody
    // anything, so at that point the decision goes on alone.
    const outcome =
      'The motion to authorize the purchase of one hundred and sixty stacking chairs at a ' +
      'cost not to exceed eleven thousand eight hundred dollars was approved unanimously.';
    expect(outcome.length).toBeGreaterThan(PAPER.maxChars - PAPER.minSentence);
    const out = summarizeNarrative(`The board took this up again at length. ${outcome}`, PAPER);
    expect(out).toBe(outcome);
  });

  it('reaches into a later paragraph for a decision', () => {
    const md =
      'Quotes on file: Squeaky Clean $749, ANAGO $951.25.\n\n' +
      'Tabled pending a decision on clean versus replace with hard flooring.';
    expect(summarizeNarrative(md, PAPER)).toBe(
      'Quotes on file: Squeaky Clean $749, ANAGO $951.25. ' +
        'Tabled pending a decision on clean versus replace with hard flooring.',
    );
  });

  it('leaves a paragraph that already fits exactly as written', () => {
    // The decision opens this one, and what follows it is the newer
    // fact. Finding the decision must not throw the rest away.
    const md =
      'Approved unanimously Mar 2026 ($55/month + $375 install, dual-path, 16hr battery). ' +
      'Contract stalled on vendor side over address correction.';
    expect(summarizeNarrative(md, PAPER)).toBe(md);
  });

  it('falls back to the first sentence when nothing was decided', () => {
    const md =
      'Water observed under the entry rug despite no rain having fallen for several days. ' +
      'Possible sources: the hot water heater, the ice maker, or a leak below the floor. ' +
      'Men\u2019s group to pull the rug back and look this weekend if the weather holds.';
    expect(summarizeNarrative(md, PAPER)).toBe(
      'Water observed under the entry rug despite no rain having fallen for several days.',
    );
  });

  it('does not read a second floor as a motion being seconded', () => {
    const md =
      'Repair abandoned after the third component failed on the second floor of the building. ' +
      'Replacement runs $800-$1,000 and Art will raise it with the Finance Committee shortly. ' +
      'Karl has the old cooler in the shed for anyone who wants the parts off it.';
    expect(md.length).toBeGreaterThan(PAPER.maxChars);
    expect(summarizeNarrative(md, PAPER)).toBe(
      'Repair abandoned after the third component failed on the second floor of the building.',
    );
  });

  it('does not read carried forward as a motion carrying', () => {
    const md =
      'Discussion carried forward to next month because the quotes had not arrived in time. ' +
      'Bart will chase both vendors before the October meeting and circulate what comes back. ' +
      'Nobody has heard from the second of the two since the spring.';
    expect(md.length).toBeGreaterThan(PAPER.maxChars);
    expect(summarizeNarrative(md, PAPER)).toBe(
      'Discussion carried forward to next month because the quotes had not arrived in time.',
    );
  });

  it('keeps an initial inside its sentence', () => {
    const md =
      'The board reviewed the shed inventory at some length before reaching any conclusion. ' +
      'Motion by Bill C. Camp to donate the puppetry materials was approved.';
    expect(summarizeNarrative(md, PAPER)).toContain('Bill C. Camp');
  });
});
