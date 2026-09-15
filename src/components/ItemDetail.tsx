import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { nextThirdTuesday, toIsoDate } from '../agenda/nextMeeting';
import { resolveItemStatus, type StatusResolution } from '../domain/status';
import { compareEntryChronologyDesc, effectiveDate } from '../domain/entries';
import {
  ENTRY_SECTION_LABEL,
  SECTION_LABEL,
  STATUS_PILL,
  dayMonth,
  longDate,
  monthYear,
  shortDate,
  tagDisplay,
  tagPillStyle,
} from '../design/tokens';
import { itemEditHref } from '../routing/hashRoute';
import { useStore } from '../store/useStore';
import type {
  AgendaSection,
  Decision,
  Item,
  ItemStatus,
  Meeting,
  MeetingEntry,
} from '../types';
import { ActionCard, DecisionCard } from './ActionsDashboard';
import { EntryEditForm } from './MeetingDetail';
import { SaveNotice, useSaveSubmit } from './SaveNotice';

const STATUS_OPTIONS: ItemStatus[] = ['Open', 'Tabled', 'Closed', 'Declined'];

// Mirrors `classify` in src/agenda/generator.ts, minus the history it
// has no access to here. Keep the two in step.
function classifyAgendaSection(item: Item, status: ItemStatus): AgendaSection | null {
  if (status === 'Closed' || status === 'Declined') return null;
  if (status === 'Tabled' || item.onHoldReason) return 'Tabled';
  if (item.defaultSection === 'OtherBusiness') return 'OtherBusiness';
  if (item.standing) return 'Update';
  if (item.defaultSection !== 'Auto') return item.defaultSection;
  return 'OldBusiness';
}

interface ItemDetailProps {
  itemId: string;
}

export function ItemDetail({ itemId }: ItemDetailProps) {
  const item = useStore((s) => s.items.find((i) => i.id === itemId));
  const allEntries = useStore((s) => s.meetingEntries);
  const allDecisions = useStore((s) => s.decisions);
  const allActions = useStore((s) => s.actionItems);
  const reconcileItem = useStore((s) => s.reconcileItem);

  const entries = useMemo(
    () =>
      allEntries
        .filter((e) => e.itemId === itemId)
        .slice()
        // Newest first, by when things actually happened — an update
        // reported between meetings sits where it belongs, not where it
        // happened to be typed.
        .sort(compareEntryChronologyDesc),
    [allEntries, itemId],
  );

  const decisions = useMemo(
    () =>
      allDecisions
        .filter((d) => d.itemId === itemId)
        .slice()
        .sort((a, b) => b.decisionDate.localeCompare(a.decisionDate)),
    [allDecisions, itemId],
  );

  const actions = useMemo(
    () =>
      allActions
        .filter((a) => a.itemId === itemId)
        .slice()
        .sort((a, b) => {
          const aOpen = a.status === 'Open' ? 0 : 1;
          const bOpen = b.status === 'Open' ? 0 : 1;
          if (aOpen !== bOpen) return aOpen - bOpen;
          return a.title.localeCompare(b.title);
        }),
    [allActions, itemId],
  );

  const openActionCount = actions.filter((a) => a.status === 'Open').length;

  // Resolved by the same rule the reconciler uses, so the warning and
  // the fix can never disagree about which status event is latest.
  const resolution = useMemo(
    () => (item ? resolveItemStatus(item, allEntries) : null),
    [item, allEntries],
  );
  const drift =
    item && resolution && resolution.status !== item.status ? resolution : null;

  if (!item) {
    return (
      <main className="page">
        <a href="#" className="back-link">
          ← Agenda
        </a>
        <p className="empty">Item not found.</p>
      </main>
    );
  }

  const agendaSection = classifyAgendaSection(item, resolution?.status ?? item.status);

  return (
    <main className="page">
      <a href="#" className="back-link">
        ← Agenda
      </a>

      <Header item={item} agendaSection={agendaSection} />

      {drift && (
        <DriftBanner
          item={item}
          drift={drift}
          onReconcile={() => reconcileItem(item.id)}
        />
      )}

      <Facts item={item} resolution={resolution} />
      <AddUpdate item={item} />

      <History entries={entries} />
      <Decisions decisions={decisions} />
      <Actions actions={actions} openCount={openActionCount} />

      {item.notes && (
        <>
          <div className="section-label">Background</div>
          <div className="facts-card" style={{ padding: '14px' }}>
            <div className="prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.notes}</ReactMarkdown>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function DriftBanner({
  item,
  drift,
  onReconcile,
}: {
  item: Item;
  drift: StatusResolution;
  onReconcile: () => Promise<void>;
}) {
  const save = useSaveSubmit();
  return (
    <div className="drift-banner">
      <div>
        {drift.basis === 'event' ? (
          <>
            The latest status change on this project — the update of{' '}
            <strong>{shortDate(drift.on)}</strong> — sets it to{' '}
            <strong>{drift.status}</strong>, but the project record still says{' '}
            <strong>{item.status}</strong>.
          </>
        ) : (
          <>
            No status change is recorded on this project any more. Before its
            history was tracked it was <strong>{drift.status}</strong>, but the
            project record says <strong>{item.status}</strong>.
          </>
        )}
      </div>
      <SaveNotice state={save} />
      <div className="form-actions" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void save.run(onReconcile)}
          disabled={save.submitting || save.blocked}
        >
          {save.submitting ? 'Setting…' : `Set status to ${drift.status}`}
        </button>
      </div>
    </div>
  );
}

function Header({
  item,
  agendaSection,
}: {
  item: Item;
  agendaSection: AgendaSection | null;
}) {
  const statusStyle = STATUS_PILL[item.status];
  return (
    <header className="detail-header">
      <div className="badge-row">
        <span
          className="status-pill"
          style={{ background: statusStyle.bg, color: statusStyle.fg }}
        >
          {item.status}
          {agendaSection ? ` · ${SECTION_LABEL[agendaSection]}` : ''}
        </span>
        {item.standing && <span className="badge">Standing</span>}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <h1>{item.title}</h1>
        <a
          href={itemEditHref(item.id)}
          className="btn btn-ghost"
          style={{ flex: '0 0 auto' }}
        >
          Edit
        </a>
      </div>
      {item.tags.length > 0 && (
        <div className="tag-row">
          {item.tags.map((t) => (
            <span key={t} className="tag-pill" style={tagPillStyle(t)}>
              {tagDisplay(t)}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

function statusSetBy(resolution: StatusResolution): string {
  switch (resolution.basis) {
    case 'event':
      return resolution.on ? `The update of ${dayMonth(resolution.on)}` : 'A recorded update';
    case 'baseline':
      return 'Where it stood before any update was recorded';
    case 'stored':
      return 'The project record — no update has changed it';
  }
}

function Facts({
  item,
  resolution,
}: {
  item: Item;
  resolution: StatusResolution | null;
}) {
  const rows: Array<[string, React.ReactNode]> = [];
  if (item.assignedTo) rows.push(['Assigned', item.assignedTo]);
  if (item.firstRaisedDate)
    rows.push(['First raised', longDate(item.firstRaisedDate)]);
  if (item.defaultSection !== 'Auto')
    rows.push(['Default section', item.defaultSection]);
  if (item.onHoldReason) rows.push(['On hold', item.onHoldReason]);
  if (item.deferredUntil)
    rows.push(['Deferred until', longDate(item.deferredUntil)]);
  if (item.closedDate) rows.push(['Closed', longDate(item.closedDate)]);
  if (item.closedReason) rows.push(['Closed reason', item.closedReason]);
  if (resolution) rows.push(['Status set by', statusSetBy(resolution)]);
  if (rows.length === 0) return null;
  return (
    <dl className="facts-card">
      {rows.map(([k, v]) => (
        <div key={k} className="facts-row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

interface TargetMeeting {
  meeting?: Meeting;
  pendingDate: string;
}

function resolveTarget(meetings: Meeting[]): TargetMeeting {
  const today = toIsoDate(new Date());
  const upcoming = meetings
    .filter((m) => m.meetingDate >= today)
    .sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));
  if (upcoming.length > 0) {
    return { meeting: upcoming[0], pendingDate: upcoming[0].meetingDate };
  }
  return { pendingDate: toIsoDate(nextThirdTuesday(new Date())) };
}

function AddUpdate({ item }: { item: Item }) {
  const meetings = useStore((s) => s.meetings);
  const createMeeting = useStore((s) => s.createMeeting);
  const addInterimUpdate = useStore((s) => s.addInterimUpdate);
  const missingColumns = useStore((s) => s.missingColumns);

  const [open, setOpen] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [reportedDate, setReportedDate] = useState(() => toIsoDate(new Date()));
  const [statusChangeTo, setStatusChangeTo] = useState<ItemStatus | ''>('');
  const save = useSaveSubmit();

  const target = useMemo(() => resolveTarget(meetings), [meetings]);
  const meetingExists = !!target.meeting;
  const meetingDate = target.meeting?.meetingDate ?? target.pendingDate;
  // Visible on that agenda only if it was reported by then.
  const showsOnThisAgenda = reportedDate <= meetingDate;
  const reportedDateUnsupported = missingColumns.some(
    (c) => c.list === 'MeetingEntries' && c.field === 'ReportedDate',
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn btn-primary btn-block"
      >
        Add an update for the {dayMonth(meetingDate)} meeting
      </button>
    );
  }

  const reset = () => {
    setNarrative('');
    setReportedDate(toIsoDate(new Date()));
    setStatusChangeTo('');
    save.clear();
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!narrative.trim()) {
      save.setMessage('Type what happened before saving.');
      return;
    }
    const ok = await save.run(async () => {
      let meetingId = target.meeting?.id;
      if (!meetingId) {
        const created = await createMeeting({ meetingDate: target.pendingDate });
        meetingId = created.id;
      }
      await addInterimUpdate({
        itemId: item.id,
        meetingId,
        narrative: narrative.trim(),
        reportedDate,
        statusChangeTo: statusChangeTo || undefined,
      });
    });
    if (ok) reset();
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-target">
        {meetingExists ? (
          <>
            Goes to the <strong>{dayMonth(meetingDate)}</strong> meeting.{' '}
            {showsOnThisAgenda
              ? 'It will print on that agenda.'
              : 'Reported after that meeting date, so it will print on a later agenda.'}
          </>
        ) : (
          <>
            No meeting exists yet. Saving creates the{' '}
            <strong>{dayMonth(target.pendingDate)}</strong> regular meeting and
            attaches this update to it.
          </>
        )}
      </div>
      <label className="form-field">
        <span>What happened</span>
        <textarea
          rows={4}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="Elevator phone installed today."
          autoFocus
        />
      </label>
      <div className="form-row">
        <label className="form-field">
          <span>Date reported</span>
          <input
            type="date"
            value={reportedDate}
            onChange={(e) => setReportedDate(e.target.value)}
          />
          <span className="field-hint">
            When you heard it — not when the meeting is.
          </span>
        </label>
        <label className="form-field">
          <span>Status change (optional)</span>
          <select
            value={statusChangeTo}
            onChange={(e) => setStatusChangeTo(e.target.value as ItemStatus | '')}
          >
            <option value="">No change</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      {reportedDateUnsupported && (
        <p className="notice notice-info">
          This site has no ReportedDate column yet, so updates between
          meetings are filed on the meeting date and print on the agenda
          after it. See docs/sharepoint-columns.md.
        </p>
      )}
      <SaveNotice state={save} />
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.submitting || save.blocked}
        >
          {save.submitting ? 'Saving…' : 'Save update'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="btn btn-ghost"
          disabled={save.submitting}
        >
          {save.blocked ? 'Close' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}

function History({ entries }: { entries: MeetingEntry[] }) {
  return (
    <>
      <div className="section-label">
        History <span className="meta">· {entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="empty">No prior meeting entries.</p>
      ) : (
        <ol className="timeline">
          {entries.map((entry, i) => (
            <HistoryRow key={entry.id} entry={entry} isFirst={i === 0} />
          ))}
        </ol>
      )}
    </>
  );
}

function HistoryRow({ entry, isFirst }: { entry: MeetingEntry; isFirst: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className={`timeline-row ${isFirst ? 'current' : ''}`}>
        <EntryEditForm entry={entry} onClose={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className={`timeline-row ${isFirst ? 'current' : ''}`}>
      <div className="timeline-head">
        <span className="timeline-date">{monthYear(effectiveDate(entry))}</span>
        <span className="timeline-section">{ENTRY_SECTION_LABEL[entry.section]}</span>
        {entry.kind === 'Premeeting' && (
          <span className="meta">
            Reported {dayMonth(effectiveDate(entry))}, before the meeting
          </span>
        )}
        {entry.statusChangeTo && (
          <span
            className="status-pill"
            style={{
              background: STATUS_PILL[entry.statusChangeTo].bg,
              color: STATUS_PILL[entry.statusChangeTo].fg,
            }}
          >
            → {entry.statusChangeTo}
          </span>
        )}
      </div>
      {entry.narrative ? (
        <div className="prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.narrative}</ReactMarkdown>
        </div>
      ) : (
        <p className="empty">No narrative recorded.</p>
      )}
      <div className="form-actions" style={{ marginTop: 6 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setEditing(true)}
        >
          Edit entry
        </button>
      </div>
    </li>
  );
}

function Decisions({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return null;
  return (
    <>
      <div className="section-label">
        Decisions <span className="meta">· {decisions.length}</span>
      </div>
      <ul className="action-list">
        {decisions.map((d) => (
          <DecisionCard key={d.id} decision={d} />
        ))}
      </ul>
    </>
  );
}

function Actions({
  actions,
  openCount,
}: {
  actions: import('../types').ActionItem[];
  openCount: number;
}) {
  if (actions.length === 0) return null;
  return (
    <>
      <div className="section-label">
        Action items <span className="meta">· {openCount} open</span>
      </div>
      <ul className="action-list">
        {actions.map((a) => (
          <ActionCard key={a.id} action={a} />
        ))}
      </ul>
    </>
  );
}
