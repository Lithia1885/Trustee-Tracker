import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ENTRY_SECTION_COLOR,
  ENTRY_SECTION_LABEL,
  STATUS_PILL,
  eyebrowDate,
  longDate,
} from '../design/tokens';
import { itemHref, meetingsHref } from '../routing/hashRoute';
import {
  useStore,
  type ActionItemDraft,
  type DecisionDraft,
  type MeetingDraft,
} from '../store/useStore';
import type {
  ActionItem,
  Decision,
  DecisionType,
  EntryKind,
  EntrySection,
  Item,
  ItemStatus,
  Meeting,
  MeetingEntry,
  MeetingType,
} from '../types';
import { ActionCard, DecisionCard } from './ActionsDashboard';
import { SaveNotice, useSaveSubmit } from './SaveNotice';

const STATUS_OPTIONS: ItemStatus[] = ['Open', 'Tabled', 'Closed', 'Declined'];
const SECTION_OPTIONS: EntrySection[] = ['Update', 'OldBusiness', 'NewBusiness', 'OtherBusiness'];
const DECISION_TYPES: DecisionType[] = ['Approval', 'Denial', 'Authorization', 'Procedural'];
const MEETING_TYPES: MeetingType[] = ['Regular', 'Special'];

interface MeetingDetailProps {
  meetingId: string;
}

export function MeetingDetail({ meetingId }: MeetingDetailProps) {
  const meeting = useStore((s) => s.meetings.find((m) => m.id === meetingId));
  const items = useStore((s) => s.items);
  const allEntries = useStore((s) => s.meetingEntries);
  const allActions = useStore((s) => s.actionItems);
  const allDecisions = useStore((s) => s.decisions);

  const entries = useMemo(
    () =>
      allEntries
        .filter((e) => e.meetingId === meetingId)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allEntries, meetingId],
  );

  const grouped = useMemo(() => {
    const out: Record<EntrySection, MeetingEntry[]> = {
      Update: [],
      OldBusiness: [],
      NewBusiness: [],
      OtherBusiness: [],
    };
    for (const e of entries) out[e.section].push(e);
    return out;
  }, [entries]);

  const usedItemIds = useMemo(() => new Set(entries.map((e) => e.itemId)), [entries]);
  const itemsById = useMemo(() => {
    const m = new Map<string, Item>();
    for (const i of items) m.set(i.id, i);
    return m;
  }, [items]);

  if (!meeting) {
    return (
      <main className="page">
        <a href={meetingsHref} className="back-link">
          ← Meetings
        </a>
        <p className="empty">Meeting not found.</p>
      </main>
    );
  }

  return (
    <main className="page">
      <a href={meetingsHref} className="back-link">
        ← Meetings
      </a>

      <MeetingHeader meeting={meeting} />

      <AddEntry meeting={meeting} items={items} usedItemIds={usedItemIds} entries={entries} />

      {SECTION_OPTIONS.map((section) => (
        <SectionBlock
          key={section}
          section={section}
          entries={grouped[section]}
          itemsById={itemsById}
          actions={allActions}
          decisions={allDecisions}
          meeting={meeting}
        />
      ))}
    </main>
  );
}

function MeetingHeader({ meeting }: { meeting: Meeting }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <MeetingEdit meeting={meeting} onClose={() => setEditing(false)} />;
  }

  const facts: Array<[string, string]> = [];
  if (meeting.location) facts.push(['Location', meeting.location]);
  if (meeting.openingPrayerBy) facts.push(['Opening prayer', meeting.openingPrayerBy]);
  if (meeting.adjournedAt) facts.push(['Adjourned', meeting.adjournedAt]);
  if (meeting.nextMeetingDate) facts.push(['Next meeting', longDate(meeting.nextMeetingDate)]);
  if (meeting.openCloseThisMonth) facts.push(['Open/close this month', meeting.openCloseThisMonth]);
  if (meeting.openCloseNextMonth) facts.push(['Open/close next month', meeting.openCloseNextMonth]);

  return (
    <header className="detail-header">
      <div className="badge-row">
        <span className="status-pill" style={{ background: 'var(--teal-soft)', color: 'var(--teal)' }}>
          {meeting.meetingType}
        </span>
        <span className="eyebrow" style={{ margin: 0 }}>{eyebrowDate(meeting.meetingDate)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h1>{meeting.title}</h1>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ flex: '0 0 auto' }}
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </div>

      {facts.length > 0 && (
        <dl className="facts-card" style={{ marginTop: 14 }}>
          {facts.map(([k, v]) => (
            <div key={k} className="facts-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {(meeting.membersPresent || meeting.membersAbsent || meeting.guests) && (
        <dl className="facts-card">
          {meeting.membersPresent && (
            <div className="facts-row">
              <dt>Present</dt>
              <dd>{meeting.membersPresent}</dd>
            </div>
          )}
          {meeting.membersAbsent && (
            <div className="facts-row">
              <dt>Absent</dt>
              <dd>{meeting.membersAbsent}</dd>
            </div>
          )}
          {meeting.guests && (
            <div className="facts-row">
              <dt>Guests</dt>
              <dd>{meeting.guests}</dd>
            </div>
          )}
        </dl>
      )}
    </header>
  );
}

function meetingToDraft(m: Meeting): MeetingDraft {
  const suffixMatch = m.title.match(/ — (.+)$/);
  return {
    meetingDate: m.meetingDate,
    meetingType: m.meetingType,
    titleSuffix: suffixMatch ? suffixMatch[1] : '',
    location: m.location ?? '',
    membersPresent: m.membersPresent ?? '',
    membersAbsent: m.membersAbsent ?? '',
    guests: m.guests ?? '',
    openingPrayerBy: m.openingPrayerBy ?? '',
    adjournedAt: m.adjournedAt ?? '',
    nextMeetingDate: m.nextMeetingDate ?? '',
    openCloseThisMonth: m.openCloseThisMonth ?? '',
    openCloseNextMonth: m.openCloseNextMonth ?? '',
  };
}

function MeetingEdit({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const updateMeeting = useStore((s) => s.updateMeeting);
  const [draft, setDraft] = useState<MeetingDraft>(() => meetingToDraft(meeting));
  const save = useSaveSubmit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await save.run(() => updateMeeting(meeting.id, draft));
    if (ok) onClose();
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label className="form-field">
          <span>Date</span>
          <input
            type="date"
            value={draft.meetingDate}
            onChange={(e) => setDraft({ ...draft, meetingDate: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Type</span>
          <select
            value={draft.meetingType}
            onChange={(e) => setDraft({ ...draft, meetingType: e.target.value as MeetingType })}
          >
            {MEETING_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="form-field">
        <span>Title suffix</span>
        <input
          type="text"
          value={draft.titleSuffix ?? ''}
          onChange={(e) => setDraft({ ...draft, titleSuffix: e.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Location</span>
        <input
          type="text"
          value={draft.location ?? ''}
          onChange={(e) => setDraft({ ...draft, location: e.target.value })}
        />
      </label>
      <div className="form-row">
        <label className="form-field">
          <span>Opening prayer by</span>
          <input
            type="text"
            value={draft.openingPrayerBy ?? ''}
            onChange={(e) => setDraft({ ...draft, openingPrayerBy: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Adjourned at</span>
          <input
            type="text"
            value={draft.adjournedAt ?? ''}
            onChange={(e) => setDraft({ ...draft, adjournedAt: e.target.value })}
            placeholder="8:42 PM"
          />
        </label>
      </div>
      <label className="form-field">
        <span>Members present (one per line)</span>
        <textarea
          rows={4}
          value={draft.membersPresent ?? ''}
          onChange={(e) => setDraft({ ...draft, membersPresent: e.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Members absent</span>
        <textarea
          rows={2}
          value={draft.membersAbsent ?? ''}
          onChange={(e) => setDraft({ ...draft, membersAbsent: e.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Guests</span>
        <textarea
          rows={2}
          value={draft.guests ?? ''}
          onChange={(e) => setDraft({ ...draft, guests: e.target.value })}
        />
      </label>
      <div className="form-row">
        <label className="form-field">
          <span>Next meeting date</span>
          <input
            type="date"
            value={draft.nextMeetingDate ?? ''}
            onChange={(e) => setDraft({ ...draft, nextMeetingDate: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Open/close this month</span>
          <input
            type="text"
            value={draft.openCloseThisMonth ?? ''}
            onChange={(e) => setDraft({ ...draft, openCloseThisMonth: e.target.value })}
          />
        </label>
      </div>
      <label className="form-field">
        <span>Open/close next month</span>
        <input
          type="text"
          value={draft.openCloseNextMonth ?? ''}
          onChange={(e) => setDraft({ ...draft, openCloseNextMonth: e.target.value })}
        />
      </label>
      <SaveNotice state={save} />
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.submitting || save.blocked}
        >
          {save.submitting ? 'Saving…' : 'Save meeting'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          disabled={save.submitting}
        >
          {save.blocked ? 'Close' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}

function AddEntry({
  meeting,
  items,
  usedItemIds,
  entries,
}: {
  meeting: Meeting;
  items: Item[];
  usedItemIds: Set<string>;
  entries: MeetingEntry[];
}) {
  const createMeetingEntry = useStore((s) => s.createMeetingEntry);
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState('');
  const [section, setSection] = useState<EntrySection>('OldBusiness');
  const [narrative, setNarrative] = useState('');
  const [statusChangeTo, setStatusChangeTo] = useState<ItemStatus | ''>('');
  const save = useSaveSubmit();

  const candidateItems = useMemo(() => {
    return items.slice().sort((a, b) => {
      const au = usedItemIds.has(a.id) ? 1 : 0;
      const bu = usedItemIds.has(b.id) ? 1 : 0;
      if (au !== bu) return au - bu;
      return a.title.localeCompare(b.title);
    });
  }, [items, usedItemIds]);

  const reset = () => {
    setItemId('');
    setSection('OldBusiness');
    setNarrative('');
    setStatusChangeTo('');
    save.clear();
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId) {
      save.setMessage('Pick the project this entry belongs to.');
      return;
    }
    if (!narrative.trim()) {
      save.setMessage('Type what was discussed before saving.');
      return;
    }
    const ok = await save.run(() =>
      createMeetingEntry({
        itemId,
        meetingId: meeting.id,
        section,
        narrative: narrative.trim(),
        statusChangeTo: statusChangeTo || undefined,
        kind: 'InMeeting',
      }),
    );
    if (ok) reset();
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="btn btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: 15, marginBottom: 16 }}
      >
        + Add entry ({entries.length} {entries.length === 1 ? 'recorded' : 'recorded'})
      </button>
    );
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-target">
        What the board decided at <strong>{meeting.title}</strong>. This prints on
        the next meeting's agenda, not this one's.
      </div>
      <label className="form-field">
        <span>Item</span>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} autoFocus>
          <option value="">— Pick an item —</option>
          {candidateItems.map((i) => (
            <option key={i.id} value={i.id}>
              {usedItemIds.has(i.id) ? '✓ ' : ''}
              {i.title}
              {i.status !== 'Open' ? ` (${i.status})` : ''}
            </option>
          ))}
        </select>
      </label>
      <div className="form-row">
        <label className="form-field">
          <span>Section</span>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as EntrySection)}
          >
            {SECTION_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ENTRY_SECTION_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Status change</span>
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
      <label className="form-field">
        <span>Narrative (markdown)</span>
        <textarea
          rows={5}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          placeholder="What was discussed and decided…"
        />
      </label>
      <SaveNotice state={save} />
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.submitting || save.blocked}
        >
          {save.submitting ? 'Saving…' : 'Save entry'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={reset}
          disabled={save.submitting}
        >
          {save.blocked ? 'Close' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}

function SectionBlock({
  section,
  entries,
  itemsById,
  actions,
  decisions,
  meeting,
}: {
  section: EntrySection;
  entries: MeetingEntry[];
  itemsById: Map<string, Item>;
  actions: ActionItem[];
  decisions: Decision[];
  meeting: Meeting;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <span className="dot" style={{ background: ENTRY_SECTION_COLOR[section] }} />
        <h2>{ENTRY_SECTION_LABEL[section]}</h2>
        <span className="count">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <div className="section-card section-card-empty">No entries.</div>
      ) : (
        <ol className="timeline" style={{ paddingLeft: 22 }}>
          {entries.map((entry, i) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              item={itemsById.get(entry.itemId)}
              actions={actions.filter((a) => a.meetingEntryId === entry.id)}
              decisions={decisions.filter((d) => d.meetingEntryId === entry.id)}
              meeting={meeting}
              isFirst={i === 0}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function EntryRow({
  entry,
  item,
  actions,
  decisions,
  meeting,
  isFirst,
}: {
  entry: MeetingEntry;
  item?: Item;
  actions: ActionItem[];
  decisions: Decision[];
  meeting: Meeting;
  isFirst: boolean;
}) {
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
        {item ? (
          <a href={itemHref(item.id)} className="timeline-date" style={{ color: 'var(--blue)' }}>
            {item.title}
          </a>
        ) : (
          <span className="timeline-date">[unknown item {entry.itemId}]</span>
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
        <span className="meta">#{entry.sortOrder}</span>
      </div>
      {entry.narrative ? (
        <div className="prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.narrative}</ReactMarkdown>
        </div>
      ) : (
        <p className="empty">No narrative recorded.</p>
      )}

      {actions.length > 0 && (
        <ul className="action-list" style={{ marginTop: 8 }}>
          {actions.map((a) => (
            <ActionCard key={a.id} action={a} />
          ))}
        </ul>
      )}

      {decisions.length > 0 && (
        <ul className="action-list" style={{ marginTop: 8 }}>
          {decisions.map((d) => (
            <DecisionCard key={d.id} decision={d} />
          ))}
        </ul>
      )}

      {item && (
        <EntryAddons
          entry={entry}
          item={item}
          meeting={meeting}
          onEdit={() => setEditing(true)}
        />
      )}
    </li>
  );
}

const KIND_LABEL: Record<EntryKind, string> = {
  InMeeting: 'Recorded at this meeting',
  Premeeting: 'Reported before this meeting',
};

export function EntryEditForm({
  entry,
  onClose,
}: {
  entry: MeetingEntry;
  onClose: () => void;
}) {
  const updateMeetingEntry = useStore((s) => s.updateMeetingEntry);
  const deleteMeetingEntry = useStore((s) => s.deleteMeetingEntry);

  const [section, setSection] = useState<EntrySection>(entry.section);
  const [sortOrderStr, setSortOrderStr] = useState(String(entry.sortOrder));
  const [narrative, setNarrative] = useState(entry.narrative ?? '');
  const [statusChangeTo, setStatusChangeTo] = useState<ItemStatus | ''>(
    entry.statusChangeTo ?? '',
  );
  const [kind, setKind] = useState<EntryKind>(entry.kind);
  const [reportedDate, setReportedDate] = useState(entry.reportedDate ?? '');
  const save = useSaveSubmit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sortOrder = Number.parseInt(sortOrderStr, 10);
    if (Number.isNaN(sortOrder)) {
      save.setMessage('Sort order must be a whole number.');
      return;
    }
    const ok = await save.run(() =>
      updateMeetingEntry(entry.id, {
        section,
        sortOrder,
        narrative,
        statusChangeTo: statusChangeTo === '' ? null : statusChangeTo,
        kind,
        reportedDate: reportedDate || null,
      }),
    );
    if (ok) onClose();
  };

  const onDelete = async () => {
    if (
      !window.confirm(
        'Delete this entry?\n\nThe narrative and any status change will be lost, and the project status goes back to what the remaining history says. Linked action items and decisions stay but lose their entry reference.',
      )
    ) {
      return;
    }
    const ok = await save.run(() => deleteMeetingEntry(entry.id));
    if (ok) onClose();
  };

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-row">
        <label className="form-field">
          <span>Section</span>
          <select
            value={section}
            onChange={(e) => setSection(e.target.value as EntrySection)}
          >
            {SECTION_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {ENTRY_SECTION_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Sort order</span>
          <input
            type="text"
            inputMode="numeric"
            value={sortOrderStr}
            onChange={(e) => setSortOrderStr(e.target.value)}
          />
        </label>
      </div>
      <div className="form-row">
        <label className="form-field">
          <span>When it happened</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as EntryKind)}>
            {(Object.keys(KIND_LABEL) as EntryKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Entries reported beforehand print on this meeting's agenda;
            what the meeting decided prints on the next one.
          </span>
        </label>
        <label className="form-field">
          <span>Date reported (optional)</span>
          <input
            type="date"
            value={reportedDate}
            onChange={(e) => setReportedDate(e.target.value)}
          />
          <span className="field-hint">Leave blank to use the meeting date.</span>
        </label>
      </div>
      <label className="form-field">
        <span>Status change</span>
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
      <label className="form-field">
        <span>Narrative (markdown)</span>
        <textarea
          rows={5}
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
        />
      </label>
      <SaveNotice state={save} />
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.submitting || save.blocked}
        >
          {save.submitting ? 'Saving…' : 'Save entry'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          disabled={save.submitting}
        >
          {save.blocked ? 'Close' : 'Cancel'}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-danger"
          onClick={onDelete}
          disabled={save.submitting || save.blocked}
        >
          Delete entry
        </button>
      </div>
    </form>
  );
}

function EntryAddons({
  entry,
  item,
  meeting,
  onEdit,
}: {
  entry: MeetingEntry;
  item: Item;
  meeting: Meeting;
  onEdit: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'action' | 'decision'>('idle');
  return (
    <div style={{ marginTop: 8 }}>
      {mode === 'idle' && (
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setMode('action')}>
            + Action item
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('decision')}>
            + Decision
          </button>
          <button type="button" className="btn btn-ghost" onClick={onEdit}>
            Edit entry
          </button>
        </div>
      )}
      {mode === 'action' && (
        <ActionForm entry={entry} item={item} meeting={meeting} onClose={() => setMode('idle')} />
      )}
      {mode === 'decision' && (
        <DecisionForm entry={entry} item={item} meeting={meeting} onClose={() => setMode('idle')} />
      )}
    </div>
  );
}

function ActionForm({
  entry,
  item,
  meeting,
  onClose,
}: {
  entry: MeetingEntry;
  item: Item;
  meeting: Meeting;
  onClose: () => void;
}) {
  const createActionItem = useStore((s) => s.createActionItem);
  const [draft, setDraft] = useState<ActionItemDraft>({
    meetingEntryId: entry.id,
    itemId: item.id,
    meetingId: meeting.id,
    description: '',
    assignee: item.assignedTo ?? '',
    dueHint: '',
  });
  const save = useSaveSubmit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await save.run(() => createActionItem(draft));
    if (ok) onClose();
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="form-field">
        <span>What needs to happen</span>
        <textarea
          rows={2}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          autoFocus
        />
      </label>
      <div className="form-row">
        <label className="form-field">
          <span>Assignee</span>
          <input
            type="text"
            value={draft.assignee}
            onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Due hint</span>
          <input
            type="text"
            value={draft.dueHint ?? ''}
            onChange={(e) => setDraft({ ...draft, dueHint: e.target.value })}
            placeholder="next meeting"
          />
        </label>
      </div>
      <SaveNotice state={save} />
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.submitting || save.blocked}
        >
          {save.submitting ? 'Saving…' : 'Add action'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          disabled={save.submitting}
        >
          {save.blocked ? 'Close' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}

function DecisionForm({
  entry,
  item,
  meeting,
  onClose,
}: {
  entry: MeetingEntry;
  item: Item;
  meeting: Meeting;
  onClose: () => void;
}) {
  const createDecision = useStore((s) => s.createDecision);
  const [draft, setDraft] = useState<DecisionDraft>({
    meetingEntryId: entry.id,
    itemId: item.id,
    meetingId: meeting.id,
    summary: '',
    decisionType: 'Approval',
    motionBy: '',
    secondBy: '',
    vote: '',
    amount: undefined,
    vendor: '',
  });
  const [amountStr, setAmountStr] = useState('');
  const save = useSaveSubmit();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let amount: number | undefined;
    if (amountStr.trim()) {
      const cleaned = amountStr.replace(/[^0-9.]/g, '');
      const parsed = Number.parseFloat(cleaned);
      if (Number.isNaN(parsed)) {
        save.setMessage('Amount must be a number, such as 1500 or 1712.50.');
        return;
      }
      amount = parsed;
    }
    const ok = await save.run(() => createDecision({ ...draft, amount }));
    if (ok) onClose();
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="form-field">
        <span>Summary</span>
        <input
          type="text"
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          autoFocus
        />
      </label>
      <div className="form-row">
        <label className="form-field">
          <span>Type</span>
          <select
            value={draft.decisionType}
            onChange={(e) =>
              setDraft({ ...draft, decisionType: e.target.value as DecisionType })
            }
          >
            {DECISION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Vote</span>
          <input
            type="text"
            value={draft.vote ?? ''}
            onChange={(e) => setDraft({ ...draft, vote: e.target.value })}
            placeholder="Unanimous or 6-2-1"
          />
        </label>
      </div>
      <div className="form-row">
        <label className="form-field">
          <span>Motion by</span>
          <input
            type="text"
            value={draft.motionBy ?? ''}
            onChange={(e) => setDraft({ ...draft, motionBy: e.target.value })}
          />
        </label>
        <label className="form-field">
          <span>Second by</span>
          <input
            type="text"
            value={draft.secondBy ?? ''}
            onChange={(e) => setDraft({ ...draft, secondBy: e.target.value })}
          />
        </label>
      </div>
      <div className="form-row">
        <label className="form-field">
          <span>Amount (USD)</span>
          <input
            type="text"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="1500"
            inputMode="decimal"
          />
        </label>
        <label className="form-field">
          <span>Vendor</span>
          <input
            type="text"
            value={draft.vendor ?? ''}
            onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
          />
        </label>
      </div>
      <SaveNotice state={save} />
      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.submitting || save.blocked}
        >
          {save.submitting ? 'Saving…' : 'Add decision'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClose}
          disabled={save.submitting}
        >
          {save.blocked ? 'Close' : 'Cancel'}
        </button>
      </div>
    </form>
  );
}
