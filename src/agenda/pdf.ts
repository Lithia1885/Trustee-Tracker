import jsPDF from 'jspdf';
import type { Agenda, AgendaEntry } from './generator';
import { thirdTuesdayAfter, toIsoDate } from './nextMeeting';
import type { ActionItem, Item, Meeting } from '../types';

const FONT = 'helvetica'; // Arial-equivalent; built into every PDF reader.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 54;
const BODY_W = PAGE_W - MARGIN * 2;
const PARA_GAP = 8;
const SECTION_GAP = 14;

const DEFAULT_TIME = '6 PM';
const DEFAULT_LOCATION = 'Living Faith Class room on 3rd floor';

const UNASSIGNED_HEADING = 'Not assigned to anyone yet';

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
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const w = makeWriter(doc);

  // ── Header ───────────────────────────────────────────────────
  w.line('AGENDA', { size: 14, bold: true, gap: 6 });

  const location = meeting?.location?.trim() || DEFAULT_LOCATION;
  w.line(`${formatHeaderDate(targetDate)} - ${DEFAULT_TIME} ${location}.`, { gap: PARA_GAP });

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
  writeSection(w, 'UPDATES:', agenda.updates);
  writeSection(w, 'OLD BUSINESS:', agenda.oldBusiness);
  writeSection(w, 'NEW BUSINESS:', agenda.newBusiness);
  // Tabled deliberately suppressed — the chair's agendas don't list it.
  // It is carried in the follow-up appendix instead.

  w.gap(SECTION_GAP);
  w.line('OPEN DISCUSSION', { bold: true, gap: PARA_GAP });

  const nextLine = meeting?.nextMeetingDate
    ? formatHeaderDate(meeting.nextMeetingDate)
    : formatHeaderDate(toIsoDate(thirdTuesdayAfter(parseIso(targetDate))));
  w.line(`Next Meeting. ${nextLine}`, { bold: true });

  if (input.includeFollowUp !== false) {
    writeFollowUp(w, input);
  }

  return doc;
}

function writeSection(w: Writer, heading: string, entries: AgendaEntry[]) {
  w.gap(SECTION_GAP);
  w.line(heading, { bold: true, gap: PARA_GAP, keepWith: 14 });
  if (entries.length === 0) {
    w.line('(none)', { gap: PARA_GAP });
    return;
  }
  for (const entry of entries) {
    w.line(composeItemLine(entry), { gap: PARA_GAP });
  }
}

function composeItemLine(entry: AgendaEntry): string {
  const status = entry.summary?.text.trim() ?? '';
  if (!status) return entry.item.title;
  const title = entry.item.title.replace(/[.:]$/, '');
  return `${title}. ${stripMarkdown(status)}`;
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
  if (groups.length === 0 && held.length === 0) return;

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
        // Due wording is printed exactly as it was written. It is free
        // text like "before May 19", so nothing here calls it late.
        if (action.dueHint?.trim()) parts.push(`due ${action.dueHint.trim()}`);
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
  }
}

function stripMarkdown(s: string): string {
  return s
    .replace(/^[\s>*#-]+/gm, '')
    .replace(/[*_`~]{1,3}/g, '')
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
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
