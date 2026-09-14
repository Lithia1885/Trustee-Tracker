import { describe, expect, it } from 'vitest';
import { collectHeldProjects, generateAgendaPdf, groupOpenActionsByOwner } from './pdf';
import { generateAgenda } from './generator';
import { extractPdfText, extractPdfTextByPage } from '../test/pdfText';
import { makeAction, makeEntry, makeItem } from '../test/fixtures';

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

    expect(text).toContain('Elevator Phone. Contractor confirmed for September 24.');
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

  it('does not clip a narrative longer than a page', () => {
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
    const doc = generateAgendaPdf({
      targetDate: TARGET,
      agenda: agendaFor(items, entries),
      includeFollowUp: false,
    });
    const pages = extractPdfTextByPage(doc);

    expect(pages.length).toBeGreaterThan(1);
    // Every copy of the sentence survived, and the closing lines that
    // follow the narrative were not pushed off the end.
    const whole = pages.join(' ').replace(/\s+/g, ' ');
    expect(whole.split('The board reviewed the quotes').length - 1).toBe(120);
    expect(whole).toContain('OPEN DISCUSSION');
    expect(whole).toContain('Next Meeting.');
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
