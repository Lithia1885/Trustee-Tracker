import { useMemo, useState } from 'react';
import {
  generateAgenda,
  type Agenda,
  type AgendaEntry,
} from '../agenda/generator';
import { nextThirdTuesday, toIsoDate } from '../agenda/nextMeeting';
import { summarizeNarrative } from '../domain/entries';
import { isStaleChunkError } from '../pwa/chunkError';
import { reloadToCurrentBuild } from '../pwa/registerSW';
import {
  SECTION_COLOR,
  SECTION_LABEL,
  SECTION_SUB,
  avatarBg,
  eyebrowDate,
  initials,
  monthYear,
  parseAssignees,
  shortDate,
  staleSinceLabel,
  tagDisplay,
  tagPillStyle,
} from '../design/tokens';
import { itemHref, newItemHref } from '../routing/hashRoute';
import { useStore } from '../store/useStore';
import type { ActionItem, AgendaSection, Item, Meeting, Tag } from '../types';

type FilterKey = 'all' | AgendaSection;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Update', label: 'Updates' },
  { key: 'OldBusiness', label: 'Old' },
  { key: 'NewBusiness', label: 'New' },
  { key: 'OtherBusiness', label: 'Open' },
  { key: 'Tabled', label: 'Tabled' },
];

const SECTIONS: AgendaSection[] = [
  'Update',
  'OldBusiness',
  'NewBusiness',
  'OtherBusiness',
  'Tabled',
];

// The four the stat strip counts; Open Discussion is a fixed slot, not
// a workload to measure.
const COUNTED_SECTIONS: AgendaSection[] = ['Update', 'OldBusiness', 'NewBusiness', 'Tabled'];

function entriesFor(agenda: Agenda, section: AgendaSection): AgendaEntry[] {
  switch (section) {
    case 'Update':
      return agenda.updates;
    case 'OldBusiness':
      return agenda.oldBusiness;
    case 'NewBusiness':
      return agenda.newBusiness;
    case 'OtherBusiness':
      return agenda.otherBusiness;
    case 'Tabled':
      return agenda.tabled;
  }
}

export function AgendaView() {
  const [targetDate, setTargetDate] = useState<string>(() =>
    toIsoDate(nextThirdTuesday(new Date())),
  );
  const [filter, setFilter] = useState<FilterKey>('all');
  const [withFollowUp, setWithFollowUp] = useState(true);

  const items = useStore((s) => s.items);
  const meetingEntries = useStore((s) => s.meetingEntries);
  const actionItems = useStore((s) => s.actionItems);
  const meetings = useStore((s) => s.meetings);

  const agenda = useMemo(
    () => generateAgenda(items, meetingEntries, targetDate),
    [items, meetingEntries, targetDate],
  );

  const openActionsByItem = useMemo(() => {
    const m = new Map<string, ActionItem[]>();
    for (const a of actionItems) {
      if (a.status !== 'Open') continue;
      if (!m.has(a.itemId)) m.set(a.itemId, []);
      m.get(a.itemId)!.push(a);
    }
    return m;
  }, [actionItems]);

  const counts = useMemo<Record<AgendaSection, number>>(
    () => ({
      Update: agenda.updates.length,
      OldBusiness: agenda.oldBusiness.length,
      NewBusiness: agenda.newBusiness.length,
      OtherBusiness: agenda.otherBusiness.length,
      Tabled: agenda.tabled.length,
    }),
    [agenda],
  );

  const [printProblem, setPrintProblem] = useState<'stale' | 'failed' | null>(null);

  const visibleSections =
    filter === 'all' ? SECTIONS : SECTIONS.filter((s) => s === filter);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            {eyebrowDate(targetDate)} · Regular meeting
          </div>
          <h1>{shortDate(targetDate)} agenda</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPrintProblem(null);
              void exportAgendaPdf({
                targetDate,
                agenda,
                meetings,
                items,
                actionItems,
                includeFollowUp: withFollowUp,
              }).catch((err) => {
                // The printing code is loaded on demand, so this is the
                // one place in the app a tab can reach for a chunk that
                // a deploy has renamed out from under it.
                setPrintProblem(isStaleChunkError(err) ? 'stale' : 'failed');
                if (!isStaleChunkError(err)) console.error('Print failed', err);
              });
            }}
          >
            Print agenda
          </button>
          <a href={newItemHref} className="btn-fab" aria-label="New item">
            +
          </a>
        </div>
      </header>

      {printProblem && (
        <div
          className={printProblem === 'stale' ? 'notice notice-warn' : 'notice notice-error'}
          role="alert"
        >
          <p className="notice-heading">
            {printProblem === 'stale'
              ? 'This page is running an older version'
              : "The agenda didn't print"}
          </p>
          <p className="notice-body">
            {printProblem === 'stale'
              ? 'The app was updated while this tab was open, so the printing code it just reached for is no longer there. Reloading picks up the current version; nothing on this page is lost.'
              : 'The printing code did not finish downloading. This is usually the connection rather than the app.'}
          </p>
          <p className="notice-body">
            <button type="button" className="btn-primary" onClick={reloadToCurrentBuild}>
              {printProblem === 'stale' ? 'Reload' : 'Reload the app'}
            </button>
          </p>
        </div>
      )}

      <div className="toolbar-row">
        <DatePickerRow targetDate={targetDate} onChange={setTargetDate} />
        <label className="inline-check">
          <input
            type="checkbox"
            checked={withFollowUp}
            onChange={(e) => setWithFollowUp(e.target.checked)}
          />
          <span>Add follow-up pages to the printout</span>
        </label>
      </div>

      <div className="stat-strip">
        {COUNTED_SECTIONS.map((section) => (
          <StatChip
            key={section}
            label={SECTION_LABEL[section]}
            n={counts[section]}
            color={SECTION_COLOR[section]}
            active={filter === 'all' || filter === section}
            onClick={() =>
              setFilter((f) => (f === section ? 'all' : section))
            }
          />
        ))}
      </div>

      <div className="chip-row">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visibleSections.map((section) => (
        <Section
          key={section}
          section={section}
          targetDate={targetDate}
          entries={entriesFor(agenda, section)}
          openActionsByItem={openActionsByItem}
        />
      ))}
    </main>
  );
}

function DatePickerRow({
  targetDate,
  onChange,
}: {
  targetDate: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <input
        type="date"
        value={targetDate}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Meeting date"
        style={{
          font: 'inherit',
          fontSize: 12.5,
          padding: '5px 10px',
          border: '1px solid var(--hairline-2)',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface)',
          color: 'var(--ink-2)',
        }}
      />
    </div>
  );
}

function StatChip({
  label,
  n,
  color,
  active,
  onClick,
}: {
  label: string;
  n: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="stat"
      onClick={onClick}
      style={{
        borderColor: active ? color : undefined,
        background: active ? 'var(--surface-2)' : undefined,
      }}
    >
      <span className="stat-n" style={{ color }}>
        {n}
      </span>
      <span className="stat-label">{label}</span>
    </button>
  );
}

function Section({
  section,
  targetDate,
  entries,
  openActionsByItem,
}: {
  section: AgendaSection;
  targetDate: string;
  entries: AgendaEntry[];
  openActionsByItem: Map<string, ActionItem[]>;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <span
          className="dot"
          style={{ background: SECTION_COLOR[section] }}
        />
        <h2>{SECTION_LABEL[section]}</h2>
        <span className="count">{entries.length}</span>
        <span className="sub">· {SECTION_SUB[section]}</span>
      </div>
      <div className={`section-card ${section === 'Tabled' ? 'tabled' : ''}`}>
        {entries.length === 0 ? (
          <div className="section-card-empty">
            {section === 'Update' && 'No standing updates.'}
            {section === 'OldBusiness' && 'Nothing carried forward.'}
            {section === 'NewBusiness' && 'No new items raised.'}
            {section === 'OtherBusiness' && 'Nothing standing for open discussion.'}
            {section === 'Tabled' && 'No tabled items.'}
          </div>
        ) : (
          entries.map((entry) => (
            <AgendaRow
              key={entry.item.id}
              entry={entry}
              targetDate={targetDate}
              openActions={openActionsByItem.get(entry.item.id) ?? []}
            />
          ))
        )}
      </div>
    </section>
  );
}

function AgendaRow({
  entry,
  targetDate,
  openActions,
}: {
  entry: AgendaEntry;
  targetDate: string;
  openActions: ActionItem[];
}) {
  const { item, lastDiscussedDate } = entry;
  const assignees = parseAssignees(item.assignedTo).slice(0, 2);
  const tags: Tag[] = item.tags.slice(0, 3);
  const tagOverflow = item.tags.length - tags.length;
  // Same source of truth as the printed packet: the latest update the
  // board could have had by this date, else the background notes.
  const preview = entry.summary ? summarizeNarrative(entry.summary.text) : undefined;
  const reportedSince =
    entry.summary?.source === 'update' &&
    entry.summary.date &&
    (!lastDiscussedDate || entry.summary.date > lastDiscussedDate)
      ? entry.summary.date
      : undefined;

  return (
    <a
      href={itemHref(item.id)}
      className={`agenda-row ${entry.section === 'Tabled' ? 'muted' : ''}`}
    >
      {assignees.length > 0 ? (
        <div className="avatars">
          {assignees.map((name) => (
            <span
              key={name}
              className="avatar"
              style={{ background: avatarBg(name) }}
              title={name}
            >
              {initials(name)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="row-body">
        <div className="row-title-line">
          <span className="row-title">{item.title}</span>
        </div>
        {preview && <div className="row-note">{preview}</div>}
        {item.onHoldReason && (
          <div className="row-onhold">On hold — {item.onHoldReason}</div>
        )}
        <div className="row-meta">
          {tags.map((t) => (
            <span key={t} className="tag-pill" style={tagPillStyle(t)}>
              {tagDisplay(t)}
            </span>
          ))}
          {tagOverflow > 0 && (
            <span
              className="tag-pill"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--ink-3)',
              }}
            >
              +{tagOverflow}
            </span>
          )}
          <span className="spacer" />
          <span className={`meta-text ${entry.stale ? 'stale' : ''}`}>
            {entry.stale && entry.summary?.date
              ? `no update since ${staleSinceLabel(entry.summary.date, targetDate)}`
              : reportedSince
                ? `update ${shortDate(reportedSince)}`
                : lastDiscussedDate
                  ? monthYear(lastDiscussedDate)
                  : item.firstRaisedDate
                    ? `raised ${monthYear(item.firstRaisedDate)}`
                    : ''}
            {openActions.length > 0 && <> · {openActions.length}↻</>}
          </span>
        </div>
      </div>
    </a>
  );
}

async function exportAgendaPdf(input: {
  targetDate: string;
  agenda: Agenda;
  meetings: Meeting[];
  items: Item[];
  actionItems: ActionItem[];
  includeFollowUp: boolean;
}) {
  const { targetDate, agenda, meetings, items, actionItems, includeFollowUp } = input;
  const { generateAgendaPdf } = await import('../agenda/pdf');
  const meeting = meetings.find((m) => m.meetingDate === targetDate);
  const prevMeeting = meetings
    .filter((m) => m.meetingDate < targetDate)
    .sort((a, b) => b.meetingDate.localeCompare(a.meetingDate))[0];
  const doc = generateAgendaPdf({
    targetDate,
    meeting,
    prevMeeting,
    agenda,
    items,
    actionItems,
    includeFollowUp,
  });
  doc.save(`Trustees-Agenda-${targetDate}.pdf`);
}
