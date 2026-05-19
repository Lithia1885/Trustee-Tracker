import { useMemo, useState } from 'react';
import {
  generateAgenda,
  type Agenda,
  type AgendaEntry,
} from '../agenda/generator';
import { nextThirdTuesday, toIsoDate } from '../agenda/nextMeeting';
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
  tagDisplay,
  tagPillStyle,
} from '../design/tokens';
import { itemHref, newItemHref } from '../routing/hashRoute';
import { useStore } from '../store/useStore';
import type { ActionItem, AgendaSection, Tag } from '../types';

type FilterKey = 'all' | AgendaSection;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Update', label: 'Updates' },
  { key: 'OldBusiness', label: 'Old' },
  { key: 'NewBusiness', label: 'New' },
  { key: 'Tabled', label: 'Tabled' },
];

const SECTIONS: AgendaSection[] = ['Update', 'OldBusiness', 'NewBusiness', 'Tabled'];

function entriesFor(agenda: Agenda, section: AgendaSection): AgendaEntry[] {
  switch (section) {
    case 'Update':
      return agenda.updates;
    case 'OldBusiness':
      return agenda.oldBusiness;
    case 'NewBusiness':
      return agenda.newBusiness;
    case 'Tabled':
      return agenda.tabled;
  }
}

export function AgendaView() {
  const [targetDate, setTargetDate] = useState<string>(() =>
    toIsoDate(nextThirdTuesday(new Date())),
  );
  const [filter, setFilter] = useState<FilterKey>('all');

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

  const counts = useMemo(
    () => ({
      Update: agenda.updates.length,
      OldBusiness: agenda.oldBusiness.length,
      NewBusiness: agenda.newBusiness.length,
      Tabled: agenda.tabled.length,
    }),
    [agenda],
  );

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
            onClick={() => void exportAgendaPdf(targetDate, agenda, meetingEntries, meetings)}
            aria-label="Export agenda PDF"
          >
            Export PDF
          </button>
          <a href={newItemHref} className="btn-fab" aria-label="New item">
            +
          </a>
        </div>
      </header>

      <DatePickerRow targetDate={targetDate} onChange={setTargetDate} />

      <div className="stat-strip">
        {SECTIONS.map((section) => (
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
    <div style={{ marginBottom: 12 }}>
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
  entries,
  openActionsByItem,
}: {
  section: AgendaSection;
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
            {section === 'Tabled' && 'No tabled items.'}
          </div>
        ) : (
          entries.map((entry) => (
            <AgendaRow
              key={entry.item.id}
              entry={entry}
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
  openActions,
}: {
  entry: AgendaEntry;
  openActions: ActionItem[];
}) {
  const { item, lastDiscussedDate } = entry;
  const assignees = parseAssignees(item.assignedTo).slice(0, 2);
  const tags: Tag[] = item.tags.slice(0, 3);
  const tagOverflow = item.tags.length - tags.length;
  const preview = item.notes ? snippet(item.notes) : undefined;

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
          <span className="meta-text">
            {lastDiscussedDate
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

async function exportAgendaPdf(
  targetDate: string,
  agenda: Agenda,
  meetingEntries: import('../types').MeetingEntry[],
  meetings: import('../types').Meeting[],
) {
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
    meetingEntries,
  });
  doc.save(`Trustees-Agenda-${targetDate}.pdf`);
}

// First sentence (or first paragraph) of markdown narrative, with
// markdown formatting stripped for compact row display.
function snippet(markdown: string): string {
  const firstPara = markdown.split(/\n\s*\n/)[0] ?? '';
  const stripped = firstPara
    // Strip leading list / blockquote / heading markers at line starts
    .replace(/^[\s>*#-]+/gm, '')
    // Strip emphasis/code/strikethrough markers (not hyphens, which
    // appear in plain prose like "5-8 PM" or "6-7 panels")
    .replace(/[*_`~]{1,3}/g, '')
    // Render [text](url) as just text
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  // Pick a sentence break only if it's late enough to be informative
  // and we're truncating anyway. Parenthetical periods inside the
  // first ~60 chars are usually noise like "(~$1,500/month)."
  if (stripped.length > 140) {
    const periodIdx = stripped.slice(40).search(/[.!?](\s|$)/);
    if (periodIdx >= 0 && periodIdx + 40 < 200) {
      return stripped.slice(0, periodIdx + 40 + 1);
    }
    return stripped.slice(0, 137).trimEnd() + '…';
  }
  return stripped;
}
