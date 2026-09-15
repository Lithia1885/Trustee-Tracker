import { describe, expect, it } from 'vitest';
import {
  collectHeldProjects,
  generateAgendaPdf,
  groupOpenActionsByOwner,
  resolveMeetingLocation,
} from './pdf';
import { generateAgenda } from './generator';
import { extractPdfText, extractPdfTextByPage } from '../test/pdfText';
import { makeAction, makeEntry, makeItem, makeMeeting } from '../test/fixtures';

const TARGET = '2026-09-15';

function agendaFor(items: Parameters<typeof generateAgenda>[0], entries: Parameters<typeof generateAgenda>[1] = []) {
  return generateAgenda(items, entries, TARGET);
}

describe('generateAgendaPdf — the agenda proper', () => {
  it('prints the same status line the agenda screen shows', () => {
    const items = [makeItem({ id: 'a', title: 'Elevator Phone', notes: 'Background only.' })];
    const entries = [
      makeEntry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-08-18',
        narrative: 'Waiting on the vendor.',
      }),
      makeEntry({
        id: 'e2',
        itemId: 'a',
        meetingDate: TARGET,
        reportedDate: '2026-09-03',
        kind: 'Premeeting',
        narrative: 'Contractor confirmed for September 24.',
      }),
    ];
    const agenda = agendaFor(items, entries);
    const text = extractPdfText(generateAgendaPdf({ targetDate: TARGET, agenda }));

    expect(text).toContain('Elevator Phone (Sep 3). Contractor confirmed for September 24.');
    expect(text).not.toContain('Waiting on the vendor.');
    // The screen reads the very same selection.
    expect(agenda.oldBusiness[0].summary?.text).toBe('Contractor confirmed for September 24.');
  });

  it('points at the meeting after this one, not at this one', () => {
    const items = [makeItem({ id: 'a', title: 'Roof Inspection' })];
    // 2026-09-15 is the third Tuesday of September.
    const text = extractPdfText(
      generateAgendaPdf({ targetDate: TARGET, agenda: agendaFor(items), includeFollowUp: false }),
    );
    expect(text).toContain('Next Meeting. October 20, 2026');
  });

  it('prefers the next meeting date recorded on the meeting', () => {
    const items = [makeItem({ id: 'a', title: 'Roof Inspection' })];
    const text = extractPdfText(
      generateAgendaPdf({
        targetDate: TARGET,
        meeting: {
          id: 'm',
          title: '2026-09-15 Regular',
          meetingDate: TARGET,
          meetingType: 'Regular',
          nextMeetingDate: '2026-10-13',
        },
        agenda: agendaFor(items),
        includeFollowUp: false,
      }),
    );
    expect(text).toContain('Next Meeting. October 13, 2026');
  });

  it('keeps tabled projects out of the agenda body', () => {
    const items = [
      makeItem({ id: 'a', title: 'Carpet Cleaning', status: 'Tabled', onHoldReason: 'Clean vs replace.' }),
    ];
    const pages = extractPdfTextByPage(
      generateAgendaPdf({ targetDate: TARGET, agenda: agendaFor(items), includeFollowUp: false }),
    );
    expect(pages.join('\n')).not.toContain('Carpet Cleaning');
  });

  it('trims a long narrative to a line or two so the agenda stays workable', () => {
    const sentence =
      'The board reviewed the quotes in detail and asked for written confirmation before work begins. ';
    const items = [makeItem({ id: 'a', title: 'Long Project' })];
    const entries = [
      makeEntry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-08-18',
        narrative: sentence.repeat(120),
      }),
    ];
    const pages = extractPdfTextByPage(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor(items, entries),
        includeFollowUp: false,
      }),
    );

    // The whole agenda still fits on one page.
    expect(pages).toHaveLength(1);
    const body = pages[0].replace(/\s+/g, ' ');
    expect(body.split('The board reviewed the quotes').length - 1).toBe(1);
    expect(body).toContain('OPEN DISCUSSION');
    expect(body).toContain('Next Meeting.');
  });

  it('reprints the untrimmed narrative in the follow-up, paginating it', () => {
    const sentence =
      'The board reviewed the quotes in detail and asked for written confirmation before work begins. ';
    const items = [makeItem({ id: 'a', title: 'Long Project' })];
    const entries = [
      makeEntry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-08-18',
        narrative: sentence.repeat(120),
      }),
    ];
    const pages = extractPdfTextByPage(
      generateAgendaPdf({ targetDate: TARGET, agenda: agendaFor(items, entries), items }),
    );

    expect(pages.length).toBeGreaterThan(2);
    const whole = pages.join(' ').replace(/\s+/g, ' ');
    expect(whole).toContain('FULL NOTES');
    // One trimmed copy in the body, 120 in the follow-up: nothing clipped.
    expect(whole.split('The board reviewed the quotes').length - 1).toBe(121);
  });

  it('leaves the stored narrative untouched — trimming is render-only', () => {
    const narrative =
      'A long opening sentence that runs well past the body limit so the renderer has to cut it. ' +
      'And a second sentence that only the follow-up pages will carry in full.';
    const items = [makeItem({ id: 'a', title: 'Project' })];
    const entry = makeEntry({
      id: 'e1',
      itemId: 'a',
      meetingDate: '2026-08-18',
      narrative,
    });
    const agenda = agendaFor(items, [entry]);
    generateAgendaPdf({ targetDate: TARGET, agenda, items });

    expect(entry.narrative).toBe(narrative);
    expect(agenda.oldBusiness[0].summary?.text).toBe(narrative);
  });
});

describe('generateAgendaPdf — follow-up appendix', () => {
  const items = [
    makeItem({ id: 'a', title: 'Roof Inspection' }),
    makeItem({
      id: 'b',
      title: 'Chapel Awning',
      deferredUntil: '2026-12-01',
      onHoldReason: 'On hold pending cash position.',
    }),
    makeItem({
      id: 'c',
      title: 'Carpet Cleaning',
      status: 'Tabled',
      onHoldReason: 'Clean or replace with hard flooring.',
    }),
  ];
  const actions = [
    makeAction({
      id: '1',
      itemId: 'a',
      description: 'Get the roofing contractor introduction',
      assignee: 'Art Craddock',
      dueHint: 'before the October meeting',
    }),
    makeAction({
      id: '2',
      itemId: 'a',
      description: 'Confirm the insurance position',
      assignee: 'Bart Arther',
    }),
    makeAction({
      id: '3',
      itemId: 'a',
      description: 'Already handled',
      assignee: 'Art Craddock',
      status: 'Done',
    }),
    makeAction({ id: '4', itemId: 'a', description: 'Abandoned idea', status: 'Dropped' }),
    makeAction({ id: '5', itemId: 'b', description: 'Nobody has picked this up', assignee: '  ' }),
  ];

  function appendixText() {
    const doc = generateAgendaPdf({
      targetDate: TARGET,
      agenda: agendaFor(items),
      items,
      actionItems: actions,
    });
    const pages = extractPdfTextByPage(doc);
    return pages[pages.length - 1];
  }

  it('is clearly labelled and starts on its own page', () => {
    const doc = generateAgendaPdf({
      targetDate: TARGET,
      agenda: agendaFor(items),
      items,
      actionItems: actions,
    });
    const pages = extractPdfTextByPage(doc);
    expect(pages.length).toBeGreaterThan(1);
    const last = pages[pages.length - 1];
    expect(last).toContain('FOLLOW-UP');
    expect(last).toContain('not read at the meeting');
  });

  it('groups open actions by owner with the project and the due wording', () => {
    const text = appendixText();
    expect(text).toContain('Art Craddock');
    expect(text).toContain(
      '• Get the roofing contractor introduction — Roof Inspection — due before the October meeting',
    );
    expect(text).toContain('• Confirm the insurance position — Roof Inspection');
  });

  it('leaves Done and Dropped actions out', () => {
    const text = appendixText();
    expect(text).not.toContain('Already handled');
    expect(text).not.toContain('Abandoned idea');
  });

  it('separates unassigned work instead of inventing an owner', () => {
    const text = appendixText();
    expect(text).toContain('Not assigned to anyone yet');
    expect(text).toContain('• Nobody has picked this up');
    const groups = groupOpenActionsByOwner(actions);
    expect(groups.map((g) => g.owner)).toEqual([
      'Art Craddock',
      'Bart Arther',
      'Not assigned to anyone yet',
    ]);
  });

  it('never calls free-text due wording overdue', () => {
    const text = appendixText();
    expect(text.toLowerCase()).not.toContain('overdue');
    expect(text.toLowerCase()).not.toContain('late');
  });

  it('lists deferred and on-hold projects with reason and revisit date', () => {
    const text = appendixText();
    expect(text).toContain('Chapel Awning');
    expect(text).toContain('On hold pending cash position.');
    expect(text).toContain('Revisit on or after December 1, 2026.');
    expect(text).toContain('Carpet Cleaning');
    expect(text).toContain('Clean or replace with hard flooring.');
  });

  it('is left out when asked for, and when there is nothing to say', () => {
    const withoutFollowUp = extractPdfTextByPage(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor(items),
        items,
        actionItems: actions,
        includeFollowUp: false,
      }),
    );
    expect(withoutFollowUp.join('\n')).not.toContain('FOLLOW-UP');

    const nothingToSay = extractPdfTextByPage(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor([makeItem({ id: 'z', title: 'Plain project' })]),
        items: [],
        actionItems: [],
      }),
    );
    expect(nothingToSay.join('\n')).not.toContain('FOLLOW-UP');
  });

  it('paginates a long action list instead of clipping it', () => {
    const many = Array.from({ length: 90 }, (_, i) =>
      makeAction({
        id: String(100 + i),
        itemId: 'a',
        description: `Follow up on outstanding question number ${i + 1}`,
        assignee: `Trustee ${String(i % 9)}`,
      }),
    );
    const doc = generateAgendaPdf({
      targetDate: TARGET,
      agenda: agendaFor(items),
      items,
      actionItems: many,
    });
    const pages = extractPdfTextByPage(doc);
    const whole = pages.join('\n');
    for (const action of many) {
      expect(whole).toContain(action.description);
    }
    // The held-projects block still follows the long list.
    expect(whole).toContain('WAITING / ON HOLD');
  });
});

describe('collectHeldProjects', () => {
  it('lists each held project once, alphabetically', () => {
    const items = [
      makeItem({ id: 'b', title: 'Zinnia Bed', status: 'Tabled' }),
      makeItem({ id: 'a', title: 'Awning', deferredUntil: '2026-12-01' }),
    ];
    const held = collectHeldProjects(agendaFor(items));
    expect(held.map((e) => e.item.title)).toEqual(['Awning', 'Zinnia Bed']);
  });
});

describe('resolveMeetingLocation', () => {
  const august = makeMeeting({
    id: '39',
    meetingDate: '2026-08-18',
    location: 'Fellowship Hall',
  });
  const july = makeMeeting({ id: '38', meetingDate: '2026-07-21', location: 'Chapel' });
  const septemberNoRoom = makeMeeting({ id: '40', meetingDate: TARGET });

  it('uses the location on the meeting being printed', () => {
    const meeting = makeMeeting({ id: '40', meetingDate: TARGET, location: 'Sanctuary' });
    expect(resolveMeetingLocation(TARGET, meeting, [july, august, meeting])).toBe('Sanctuary');
  });

  it('carries forward the last room the board actually used', () => {
    expect(resolveMeetingLocation(TARGET, septemberNoRoom, [july, august, septemberNoRoom])).toBe(
      'Fellowship Hall',
    );
  });

  it('ignores rooms recorded for meetings after this one', () => {
    const october = makeMeeting({ id: '41', meetingDate: '2026-10-20', location: 'Somewhere else' });
    expect(resolveMeetingLocation(TARGET, undefined, [july, august, october])).toBe(
      'Fellowship Hall',
    );
  });

  it('falls back to the configured default when nothing is recorded', () => {
    expect(resolveMeetingLocation(TARGET, undefined, [])).toBe(
      'Living Faith Class room on 3rd floor',
    );
    expect(resolveMeetingLocation(TARGET, undefined, undefined)).toBe(
      'Living Faith Class room on 3rd floor',
    );
  });

  it('puts the resolved room in the printed header', () => {
    const text = extractPdfText(
      generateAgendaPdf({
        targetDate: TARGET,
        meetings: [july, august],
        agenda: agendaFor([makeItem({ id: 'a', title: 'Roof' })]),
        includeFollowUp: false,
      }),
    );
    expect(text).toContain('September 15, 2026 - 6 PM Fellowship Hall.');
  });
});

describe('generateAgendaPdf — how old each line is', () => {
  const items = [makeItem({ id: 'a', title: 'Shed Cleanout' })];

  function lineFor(meetingDate: string): string {
    const entries = [
      makeEntry({
        id: 'e1',
        itemId: 'a',
        meetingDate,
        narrative: 'Art and Kevin meeting Saturday.',
      }),
    ];
    return extractPdfText(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor(items, entries),
        includeFollowUp: false,
      }),
    );
  }

  it('date-stamps a recent narrative', () => {
    expect(lineFor('2026-08-18')).toContain(
      'Shed Cleanout (Aug 18). Art and Kevin meeting Saturday.',
    );
  });

  it('words an old narrative so the age is unmissable', () => {
    expect(lineFor('2026-04-21')).toContain(
      'Shed Cleanout (no update since Apr 21). Art and Kevin meeting Saturday.',
    );
  });

  it('carries the year when the narrative is from a different one', () => {
    expect(lineFor('2025-10-21')).toContain('no update since Oct 21, 2025');
  });

  it('says so plainly when a project has never been discussed', () => {
    const never = [makeItem({ id: 'b', title: 'Brand New', notes: 'Raised by email.' })];
    const text = extractPdfText(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor(never),
        includeFollowUp: false,
      }),
    );
    expect(text).toContain('Brand New (not yet discussed). Raised by email.');
  });
});

describe('generateAgendaPdf — Open Discussion', () => {
  it('renders the standing Open Discussion item at the end, not in Updates', () => {
    const items = [
      makeItem({
        id: 'a',
        title: 'Open Discussion',
        defaultSection: 'OtherBusiness',
        standing: true,
      }),
      makeItem({ id: 'b', title: 'Tutoring', standing: true }),
    ];
    const entries = [
      makeEntry({
        id: 'e1',
        itemId: 'a',
        meetingDate: '2026-08-18',
        narrative: 'Cub Scouts moving to Monday.',
      }),
      makeEntry({
        id: 'e2',
        itemId: 'b',
        meetingDate: '2026-08-18',
        narrative: 'Fall tutoring has begun.',
      }),
    ];
    const text = extractPdfText(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor(items, entries),
        includeFollowUp: false,
      }),
    );
    const updatesAt = text.indexOf('UPDATES:');
    const openAt = text.indexOf('OPEN DISCUSSION');
    const cubScoutsAt = text.indexOf('Cub Scouts moving to Monday.');
    expect(openAt).toBeGreaterThan(updatesAt);
    expect(cubScoutsAt).toBeGreaterThan(openAt);
  });

  it('keeps the Open Discussion heading even with nothing standing under it', () => {
    const text = extractPdfText(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor([makeItem({ id: 'a', title: 'Roof' })]),
        includeFollowUp: false,
      }),
    );
    expect(text).toContain('OPEN DISCUSSION');
    // The heading stands alone — no "(none)" under it.
    expect(text.slice(text.indexOf('OPEN DISCUSSION'))).not.toContain('(none)');
  });
});

describe('generateAgendaPdf — past-due actions', () => {
  const items = [makeItem({ id: 'a', title: 'Capital Campaign' })];

  function followUp(dueHint: string): string {
    const actions = [
      makeAction({ id: '1', itemId: 'a', description: 'Complete the grant narrative', dueHint }),
    ];
    const pages = extractPdfTextByPage(
      generateAgendaPdf({
        targetDate: TARGET,
        agenda: agendaFor(items),
        items,
        actionItems: actions,
      }),
    );
    // Collapse the line wrapping so a flag that lands across a line
    // break still reads as one phrase.
    return pages[pages.length - 1].replace(/\s+/g, ' ');
  }

  it('marks a date that has gone by', () => {
    expect(followUp('2026-09-01')).toContain('due 2026-09-01 — PAST DUE');
  });

  it('marks a date buried in the board’s own wording', () => {
    expect(followUp('Before spec package release ~2026-09-01')).toContain('— PAST DUE');
  });

  it('leaves a future date unmarked', () => {
    const text = followUp('Before 2026-12-01');
    expect(text).toContain('due Before 2026-12-01');
    expect(text).not.toContain('PAST DUE');
  });

  it('never marks wording that names no date', () => {
    for (const hint of ['next meeting', 'On completion of back lot']) {
      const text = followUp(hint);
      expect(text).toContain(`due ${hint}`);
      expect(text).not.toContain('PAST DUE');
    }
  });
});

describe('generateAgendaPdf — full notes', () => {
  const items = [makeItem({ id: 'a', title: 'Capital Campaign' })];
  const long =
    'Harness acquired by MozartWorks; the original founder repurchased the services division. ' +
    'Contract, billing and 1 January end date unchanged. Brandy and George are no longer with ' +
    'the company, and Aaron Lucas is the new account manager for the engagement going forward.';
  const entries = [
    makeEntry({ id: 'e1', itemId: 'a', meetingDate: '2026-08-18', narrative: long }),
  ];

  it('trims the body line but reprints the narrative in full', () => {
    const pages = extractPdfTextByPage(
      generateAgendaPdf({ targetDate: TARGET, agenda: agendaFor(items, entries), items }),
    );
    const body = pages[0].replace(/\s+/g, ' ');
    const notes = pages.slice(1).join(' ').replace(/\s+/g, ' ');

    expect(body).toContain('Capital Campaign (Aug 18). Harness acquired by MozartWorks;');
    expect(body).not.toContain('Aaron Lucas is the new account manager');
    expect(notes).toContain('FULL NOTES');
    expect(notes).toContain('Capital Campaign — Aug 18');
    expect(notes).toContain('Aaron Lucas is the new account manager');
  });

  it('carries the age wording through to the notes heading', () => {
    const old = [makeEntry({ id: 'e1', itemId: 'a', meetingDate: '2026-04-21', narrative: long })];
    const pages = extractPdfTextByPage(
      generateAgendaPdf({ targetDate: TARGET, agenda: agendaFor(items, old), items }),
    );
    expect(pages.slice(1).join(' ')).toContain('Capital Campaign — no update since Apr 21');
  });
});
