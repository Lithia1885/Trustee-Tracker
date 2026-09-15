import jsPDF from 'jspdf';
import type { Agenda, AgendaEntry } from './generator';
import { thirdTuesdayAfter, toIsoDate } from './nextMeeting';
import { useCompleteFontMetrics } from './pdfFonts';
import { stripMarkdown, summarizeNarrative } from '../domain/entries';
import { isDueHintPastDue } from '../domain/dueHint';
import type { ActionItem, Item, Meeting } from '../types';

const FONT = 'helvetica'; // Arial-equivalent; built into every PDF reader.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const BODY_W = PAGE_W - MARGIN * 2;
const PARA_GAP = 8;
const SECTION_GAP = 14;

const DEFAULT_TIME = '6 PM';

const UNASSIGNED_HEADING = 'Not assigned to anyone yet';

/**
 * The agenda body gets a line or two per project — the board works from
 * paper at the table, and the hand-typed agendas it replaces ran to a
 * page. The full narrative is not lost: it is reprinted in the
 * follow-up pages, which are reference, not reading matter.
 */
const BODY_SUMMARY = { maxChars: 190, minSentence: 50, maxSentence: 230 };

export interface AgendaPdfInput {
  targetDate: string;
  meeting?: Meeting;
  prevMeeting?: Meeting;
  agenda: Agenda;
  /** All action items; only the open ones reach the appendix. */
  actionItems?: ActionItem[];
  /** All projects, for naming the project an action belongs to. */
  items?: Item[];
  /** Print the follow-up appendix after the agenda. Default: true. */
  includeFollowUp?: boolean;
}

interface LineOptions {
  size?: number;
  bold?: boolean;
  gap?: number;
  indent?: number;
  /** Extra points to reserve, so a heading never ends a page alone. */
  keepWith?: number;
}

interface Writer {
  line: (text: string, opts?: LineOptions) => void;
  gap: (points: number) => void;
  pageBreak: () => void;
}

/**
 * Writes one wrapped line at a time, starting a new page whenever the
 * next line would cross the bottom margin. Paragraph-at-a-time writing
 * silently clipped anything taller than a page — a long narrative or a
 * long action list would simply stop mid-sentence.
 */
function makeWriter(doc: jsPDF): Writer {
  let y = MARGIN;
  const bottom = PAGE_H - MARGIN;

  const ensure = (needed: number) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = MARGIN;
    }
  };

  return {
    line(text, opts = {}) {
      const size = opts.size ?? 11;
      const leading = size + 3;
      const indent = opts.indent ?? 0;
      doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines: string[] = doc.splitTextToSize(text, BODY_W - indent);
      if (opts.keepWith) ensure(leading + opts.keepWith);
      for (const line of lines) {
        ensure(leading);
        doc.text(line, MARGIN + indent, y, { baseline: 'top' });
        y += leading;
      }
      y += opts.gap ?? 0;
    },
    gap(points) {
      y += points;
    },
    pageBreak() {
      doc.addPage();
      y = MARGIN;
    },
  };
}

export function generateAgendaPdf(input: AgendaPdfInput): jsPDF {
  const { targetDate, meeting, prevMeeting, agenda } = input;
  // putOnlyUsedFonts keeps the other thirteen built-in fonts, and the
  // widths arrays they would now carry, out of a file that only ever
  // sets Helvetica.
  const doc = new jsPDF({ unit: 'pt', format: 'letter', putOnlyUsedFonts: true });
  useCompleteFontMetrics(doc);
  const w = makeWriter(doc);

  // ── Header ───────────────────────────────────────────────────
  w.line('AGENDA', { size: 14, bold: true, gap: 6 });

  // No room on the agenda: where the board actually met is recorded in
  // the minutes afterwards, not announced beforehand.
  w.line(`${formatHeaderDate(targetDate)} - ${DEFAULT_TIME}.`, { gap: PARA_GAP });

  w.line('Opening Prayer', { gap: PARA_GAP });

  const reviewSource = prevMeeting
    ? formatMonthYear(prevMeeting.meetingDate)
    : formatMonthYear(prevMonthIso(targetDate));
  w.line(`Review of minutes from ${reviewSource}`, { gap: PARA_GAP });

  const openCloseLine = formatOpenClose(meeting, targetDate);
  if (openCloseLine) {
    w.line(openCloseLine, { gap: PARA_GAP });
  }

  // ── Sections ─────────────────────────────────────────────────
  writeSection(w, targetDate, 'UPDATES:', agenda.updates);
  writeSection(w, targetDate, 'OLD BUSINESS:', agenda.oldBusiness);
  writeSection(w, targetDate, 'NEW BUSINESS:', agenda.newBusiness);
  // Tabled deliberately suppressed — the chair's agendas don't list it.
  // It is carried in the follow-up appendix instead.

  writeSection(w, targetDate, 'OPEN DISCUSSION', agenda.otherBusiness, { emptyText: null });

  const nextLine = meeting?.nextMeetingDate
    ? formatHeaderDate(meeting.nextMeetingDate)
    : formatHeaderDate(toIsoDate(thirdTuesdayAfter(parseIso(targetDate))));
  w.line(`Next Meeting. ${nextLine}`, { bold: true });

  if (input.includeFollowUp !== false) {
    writeFollowUp(w, input);
  }

  return doc;
}

function writeSection(
  w: Writer,
  targetDate: string,
  heading: string,
  entries: AgendaEntry[],
  opts: { emptyText?: string | null } = {},
) {
  w.gap(SECTION_GAP);
  w.line(heading, { bold: true, gap: PARA_GAP, keepWith: 14 });
  if (entries.length === 0) {
    const empty = opts.emptyText === undefined ? '(none)' : opts.emptyText;
    if (empty) w.line(empty, { gap: PARA_GAP });
    return;
  }
  for (const entry of entries) {
    w.line(composeItemLine(entry, targetDate), { gap: PARA_GAP });
  }
}

/**
 * How old the line is, said in the fewest words that make it obvious.
 *
 * A narrative is written in the present tense of the meeting that
 * produced it, so "Art and Kevin meeting Saturday" reads as this
 * Saturday four months later. The date alone fixes that for a recent
 * entry; an old one gets different wording so the eye catches it.
 */
export function composeAgeNote(entry: AgendaEntry, targetDate: string): string | undefined {
  const summary = entry.summary;
  if (!summary) return undefined;
  if (summary.source === 'background') return 'not yet discussed';
  if (!summary.date) return undefined;
  const when = formatShortDate(summary.date, targetDate);
  return entry.stale ? `no update since ${when}` : when;
}

export function composeItemLine(entry: AgendaEntry, targetDate: string): string {
  const title = entry.item.title.replace(/[.:]$/, '');
  const age = composeAgeNote(entry, targetDate);
  const head = age ? `${title} (${age})` : title;
  const status = entry.summary?.text.trim();
  if (!status) return head;
  return `${head}. ${summarizeNarrative(status, BODY_SUMMARY)}`;
}

// ── Follow-up appendix ─────────────────────────────────────────

interface OwnerGroup {
  owner: string;
  actions: ActionItem[];
}

/**
 * Open actions, grouped by the owner recorded on them. Nobody is
 * invented an owner: actions with a blank assignee are collected under
 * their own heading so unclaimed work is visible as unclaimed.
 */
export function groupOpenActionsByOwner(actions: readonly ActionItem[]): OwnerGroup[] {
  const byOwner = new Map<string, ActionItem[]>();
  for (const action of actions) {
    if (action.status !== 'Open') continue;
    const owner = action.assignee.trim();
    const key = owner || UNASSIGNED_HEADING;
    const list = byOwner.get(key);
    if (list) list.push(action);
    else byOwner.set(key, [action]);
  }
  const groups = [...byOwner.entries()].map(([owner, list]) => ({ owner, actions: list }));
  groups.sort((a, b) => {
    // Unclaimed work last, so it reads as the exception it is.
    if (a.owner === UNASSIGNED_HEADING) return 1;
    if (b.owner === UNASSIGNED_HEADING) return -1;
    return a.owner.localeCompare(b.owner);
  });
  return groups;
}

/** Tabled, on-hold and deferred projects, in one list, without repeats. */
export function collectHeldProjects(agenda: Agenda): AgendaEntry[] {
  const seen = new Set<string>();
  const out: AgendaEntry[] = [];
  for (const entry of [...agenda.tabled, ...agenda.deferred]) {
    if (seen.has(entry.item.id)) continue;
    seen.add(entry.item.id);
    out.push(entry);
  }
  return out.sort((a, b) => a.item.title.localeCompare(b.item.title));
}

function writeFollowUp(w: Writer, input: AgendaPdfInput) {
  const groups = groupOpenActionsByOwner(input.actionItems ?? []);
  const held = collectHeldProjects(input.agenda);
  const noted = collectBodyEntries(input.agenda).filter((e) => e.summary?.text.trim());
  if (groups.length === 0 && held.length === 0 && noted.length === 0) return;

  const titleById = new Map<string, string>();
  for (const item of input.items ?? []) titleById.set(item.id, item.title);

  w.pageBreak();
  w.line('FOLLOW-UP', { size: 14, bold: true, gap: 4 });
  w.line(
    'Reference pages — not read at the meeting. Open work and projects waiting on something.',
    { size: 10, gap: SECTION_GAP },
  );

  if (groups.length > 0) {
    w.line('OPEN ACTION ITEMS', { bold: true, gap: PARA_GAP, keepWith: 28 });
    for (const group of groups) {
      w.line(group.owner, { size: 11, bold: true, gap: 2, keepWith: 28 });
      for (const action of group.actions) {
        const project = titleById.get(action.itemId);
        const parts = [action.description.trim()];
        if (project) parts.push(project);
        const hint = action.dueHint?.trim();
        if (hint) {
          // The wording is printed exactly as it was written. "Past
          // due" is added only where that wording plainly names a date
          // and that date has gone by — never for "next meeting".
          const late = isDueHintPastDue(hint, input.targetDate);
          parts.push(late ? `due ${hint} — PAST DUE` : `due ${hint}`);
        }
        w.line(`• ${parts.join(' — ')}`, { size: 10.5, indent: 12, gap: 3 });
      }
      w.gap(6);
    }
    w.gap(SECTION_GAP - 6);
  }

  if (held.length > 0) {
    w.line('WAITING / ON HOLD', { bold: true, gap: PARA_GAP, keepWith: 28 });
    for (const entry of held) {
      const { item } = entry;
      w.line(item.title, { size: 11, bold: true, gap: 2, keepWith: 14 });
      const reason = item.onHoldReason?.trim();
      if (reason) {
        w.line(reason, { size: 10.5, indent: 12, gap: 2 });
      } else if (item.status === 'Tabled') {
        w.line('Tabled. No reason recorded.', { size: 10.5, indent: 12, gap: 2 });
      }
      if (item.deferredUntil) {
        w.line(`Revisit on or after ${formatHeaderDate(item.deferredUntil)}.`, {
          size: 10.5,
          indent: 12,
          gap: 2,
        });
      }
      w.gap(6);
    }
    w.gap(SECTION_GAP - 6);
  }

  writeFullNotes(w, noted, input.targetDate);
}

/** Every line of the agenda body, restored to its full narrative. */
export function collectBodyEntries(agenda: Agenda): AgendaEntry[] {
  return [
    ...agenda.updates,
    ...agenda.oldBusiness,
    ...agenda.newBusiness,
    ...agenda.otherBusiness,
  ];
}

/**
 * The agenda body is trimmed to a line or two so it can be worked from
 * at the table. Nothing is lost — the untrimmed narrative is reprinted
 * here, where there is room for it.
 */
function writeFullNotes(w: Writer, entries: AgendaEntry[], targetDate: string) {
  if (entries.length === 0) return;

  w.line('FULL NOTES', { bold: true, gap: 4, keepWith: 28 });
  w.line('The complete narrative behind each line of the agenda, in agenda order.', {
    size: 10,
    gap: PARA_GAP,
  });

  for (const entry of entries) {
    const age = composeAgeNote(entry, targetDate);
    const heading = age ? `${entry.item.title} — ${age}` : entry.item.title;
    w.line(heading, { size: 11, bold: true, gap: 2, keepWith: 14 });
    w.line(stripMarkdown(entry.summary!.text), { size: 10.5, indent: 12, gap: 2 });
    w.gap(6);
  }
}

function parseIso(iso: string): Date {
  return new Date(iso + 'T00:00:00');
}

function formatHeaderDate(iso: string): string {
  const d = parseIso(iso);
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * "Aug 18", or "Aug 18, 2025" when the year differs from the meeting's
 * — short enough to sit inside a line, never ambiguous about which year.
 */
function formatShortDate(iso: string, relativeTo: string): string {
  const d = parseIso(iso);
  const sameYear = iso.slice(0, 4) === relativeTo.slice(0, 4);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function formatMonthYear(iso: string): string {
  const d = parseIso(iso);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function monthName(iso: string): string {
  return parseIso(iso).toLocaleDateString('en-US', { month: 'long' });
}

function prevMonthIso(iso: string): string {
  const d = parseIso(iso);
  d.setMonth(d.getMonth() - 1);
  return toIsoDate(d);
}

function nextMonthIso(iso: string): string {
  const d = parseIso(iso);
  d.setMonth(d.getMonth() + 1);
  return toIsoDate(d);
}

function formatOpenClose(meeting: Meeting | undefined, targetDate: string): string | null {
  const thisMonth = monthName(targetDate);
  const nextMonth = monthName(nextMonthIso(targetDate));
  const thisName = meeting?.openCloseThisMonth?.trim();
  const nextName = meeting?.openCloseNextMonth?.trim();
  if (!thisName && !nextName) return null;
  const left = thisName ? `${thisMonth}, ${thisName}` : thisMonth;
  const right = nextName ? `${nextMonth}, ${nextName}` : nextMonth;
  return `Open/Close: ${left} – ${right}`;
}
