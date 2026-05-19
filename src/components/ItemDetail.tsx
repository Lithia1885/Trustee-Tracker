import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { nextThirdTuesday, toIsoDate } from '../agenda/nextMeeting';
import {
  ENTRY_SECTION_LABEL,
  SECTION_LABEL,
  STATUS_PILL,
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

const STATUS_OPTIONS: ItemStatus[] = ['Open', 'Tabled', 'Closed', 'Declined'];

function classifyAgendaSection(item: Item): AgendaSection | null {
  if (item.status === 'Closed' || item.status === 'Declined') return null;
  if (item.status === 'Tabled' || item.onHoldReason) return 'Tabled';
  if (item.defaultSection !== 'Auto') return item.defaultSection;
  if (item.standing) return 'Update';
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
        .sort((a, b) => {
          if (a.meetingDate !== b.meetingDate) {
            return b.meetingDate.localeCompare(a.meetingDate);
          }
          return a.sortOrder - b.sortOrder;
        }),
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

  const drift = useMemo(() => {
    if (!item) return null;
    const lastChange = entries.find((e) => e.statusChangeTo);
    if (!lastChange?.statusChangeTo) return null;
    if (lastChange.statusChangeTo === item.status) return null;
    return { expected: lastChange.statusChangeTo, on: lastChange.meetingDate };
  }, [item, entries]);

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

  const agendaSection = classifyAgendaSection(item);

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

      <Facts item={item} />
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
  drift: { expected: ItemStatus; on: string };
  onReconcile: () => Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const apply = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onReconcile();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="drift-banner">
      <div>
        Status drift: most recent meeting entry on{' '}
        <strong>{shortDate(drift.on)}</strong> set status to{' '}
        <strong>{drift.expected}</strong>, but the item is{' '}
        <strong>{item.status}</strong>.
      </div>
      {error && (
        <div style={{ marginTop: 6, color: 'var(--rose)' }}>{error}</div>
      )}
      <div className="form-actions" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={apply}
          disabled={submitting}
        >
          {submitting ? 'Reconciling…' : `Set status to ${drift.expected}`}
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

function Facts({ item }: { item: Item }) {
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

  const [open, setOpen] = useState(false);
  const [narrative, setNarrative] = useState('');
  const [statusChangeTo, setStatusChangeTo] = useState<ItemStatus | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(() => resolveTarget(meetings), [meetings]);
  const meetingExists = !!target.meeting;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: 15 }}
      >
        + Add update for {meetingExists ? target.meeting!.title : `${shortDate(target.pendingDate)} meeting`}
      </button>
    );
  }

  const reset = () => {
    setNarrative('');
    setStatusChangeTo('');
    setError(null);
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!narrative.trim()) {
      setError('Narrative is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let meetingId = target.meeting?.id;
      if (!meetingId) {
        const confirmed = window.confirm(
          `No future meeting exists. Create ${target.pendingDate} (Regular) and attach this update?`,
        );
        if (!confirmed) {
          setSubmitting(false);
          return;
        }
        const created = await createMeeting({ meetingDate: target.pendingDate });
        meetingId = created.id;
      }
      await addInterimUpdate({
        itemId: item.id,
        meetingId,
        narrative: narrative.trim(),
        statusChangeTo: statusChangeTo || undefined,
      });
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-target">
        {meetingExists ? (
          <>
            Attaching to <strong>{target.meeting!.title}</strong>
          </>
        ) : (
          <>
            No future meeting yet — will create{' '}
            <strong>{target.pendingDate} Regular</strong> on submit
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
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save update'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="btn btn-ghost"
          disabled={submitting}
        >
          Cancel
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
        <span className="timeline-date">{monthYear(entry.meetingDate)}</span>
        <span className="timeline-section">{ENTRY_SECTION_LABEL[entry.section]}</span>
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
