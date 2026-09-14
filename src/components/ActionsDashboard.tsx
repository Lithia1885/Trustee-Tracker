import { useMemo, useState } from 'react';
import {
  avatarBg,
  formatMoney,
  initials,
  monthYear,
} from '../design/tokens';
import { itemHref } from '../routing/hashRoute';
import { useStore } from '../store/useStore';
import { SaveNotice, useSaveSubmit } from './SaveNotice';
import type {
  ActionItem,
  ActionStatus,
  Decision,
  DecisionType,
  Meeting,
} from '../types';

const DECISION_TYPES: DecisionType[] = ['Approval', 'Denial', 'Authorization', 'Procedural'];

const STATUS_FILTERS: Array<{ key: ActionStatus | 'All'; label: string }> = [
  { key: 'Open', label: 'Open' },
  { key: 'Done', label: 'Done' },
  { key: 'Dropped', label: 'Dropped' },
  { key: 'All', label: 'All' },
];

export function ActionsDashboard() {
  const actions = useStore((s) => s.actionItems);
  const meetings = useStore((s) => s.meetings);

  const [filter, setFilter] = useState<ActionStatus | 'All'>('Open');

  const meetingById = useMemo(() => {
    const m = new Map<string, Meeting>();
    for (const meeting of meetings) m.set(meeting.id, meeting);
    return m;
  }, [meetings]);

  const filtered = useMemo(
    () => actions.filter((a) => filter === 'All' || a.status === filter),
    [actions, filter],
  );

  const byAssignee = useMemo(() => {
    const groups = new Map<string, ActionItem[]>();
    for (const a of filtered) {
      const key = a.assignee || '(unassigned)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    for (const [, list] of groups) {
      list.sort((x, y) => {
        const xDate = meetingById.get(x.assignedAtMeetingId)?.meetingDate ?? '';
        const yDate = meetingById.get(y.assignedAtMeetingId)?.meetingDate ?? '';
        return xDate.localeCompare(yDate);
      });
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, meetingById]);

  const counts = useMemo(() => {
    const c = { Open: 0, Done: 0, Dropped: 0, All: 0 };
    for (const a of actions) {
      c.All += 1;
      c[a.status] += 1;
    }
    return c;
  }, [actions]);

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Between meetings</div>
          <h1>Action items</h1>
        </div>
      </header>

      <div className="chip-row">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span style={{ opacity: 0.7 }}>{counts[f.key]}</span>
          </button>
        ))}
      </div>

      {byAssignee.length === 0 ? (
        <p className="empty">No action items match this filter.</p>
      ) : (
        byAssignee.map(([assignee, list]) => (
          <section key={assignee} className="section">
            <div className="section-head">
              <span
                className="avatar"
                style={{
                  width: 24,
                  height: 24,
                  background: avatarBg(assignee),
                  border: 'none',
                  fontSize: 10,
                }}
              >
                {initials(assignee)}
              </span>
              <h2 style={{ textTransform: 'none', letterSpacing: 0, fontSize: 14 }}>
                {assignee}
              </h2>
              <span className="count">{list.length}</span>
            </div>
            <ul className="action-list">
              {list.map((action) => (
                <ActionCard key={action.id} action={action} showItemLink />
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

export function ActionCard({
  action,
  showItemLink = false,
}: {
  action: ActionItem;
  showItemLink?: boolean;
}) {
  const completeActionItem = useStore((s) => s.completeActionItem);
  const dropActionItem = useStore((s) => s.dropActionItem);
  const reopenActionItem = useStore((s) => s.reopenActionItem);
  const updateActionItem = useStore((s) => s.updateActionItem);
  const deleteActionItem = useStore((s) => s.deleteActionItem);
  const meetings = useStore((s) => s.meetings);
  const items = useStore((s) => s.items);

  const assignedAt = meetings.find((m) => m.id === action.assignedAtMeetingId);
  const completedAt = action.completedAtMeetingId
    ? meetings.find((m) => m.id === action.completedAtMeetingId)
    : undefined;
  const itemTitle = items.find((i) => i.id === action.itemId)?.title;

  const [mode, setMode] = useState<'idle' | 'complete' | 'drop' | 'edit'>('idle');
  const [note, setNote] = useState('');
  const [completedAtMeetingId, setCompletedAtMeetingId] = useState('');
  const [editDescription, setEditDescription] = useState(action.description);
  const [editAssignee, setEditAssignee] = useState(action.assignee);
  const [editDueHint, setEditDueHint] = useState(action.dueHint ?? '');
  const save = useSaveSubmit();

  const reset = () => {
    setMode('idle');
    setNote('');
    setCompletedAtMeetingId('');
    setEditDescription(action.description);
    setEditAssignee(action.assignee);
    setEditDueHint(action.dueHint ?? '');
    save.clear();
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await save.run(() =>
      updateActionItem(action.id, {
        description: editDescription,
        assignee: editAssignee,
        dueHint: editDueHint,
      }),
    );
    if (ok) reset();
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete this action item?\n\n"${action.description}"`)) return;
    await save.run(() => deleteActionItem(action.id));
  };

  const submitComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await save.run(() =>
      completeActionItem({
        actionId: action.id,
        completedAtMeetingId: completedAtMeetingId || undefined,
        completedNote: note,
      }),
    );
    if (ok) reset();
  };

  const submitDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await save.run(() =>
      dropActionItem({ actionId: action.id, completedNote: note }),
    );
    if (ok) reset();
  };

  const reopen = async () => {
    await save.run(() => reopenActionItem({ actionId: action.id }));
  };

  const submitting = save.submitting || save.blocked;

  const sortedMeetings = useMemo(
    () => meetings.slice().sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)),
    [meetings],
  );

  const checkboxGlyph =
    action.status === 'Done' ? '✓' : action.status === 'Dropped' ? '—' : '';

  return (
    <li className={`action-card ${action.status.toLowerCase()}`}>
      <span className="action-checkbox">{checkboxGlyph}</span>
      <div className="action-body">
        <div className="action-top-line">
          <span className="action-assignee">{action.assignee}</span>
          {action.dueHint && <span>· due {action.dueHint}</span>}
          {assignedAt && <span>· assigned {monthYear(assignedAt.meetingDate)}</span>}
        </div>
        <div className="action-desc">{action.description}</div>
        {showItemLink && itemTitle && (
          <div className="action-meta">
            <a href={itemHref(action.itemId)}>{itemTitle}</a>
          </div>
        )}
        {action.completedNote && (
          <div className="action-note">
            {completedAt && (
              <strong>Completed {monthYear(completedAt.meetingDate)}: </strong>
            )}
            {action.completedNote}
          </div>
        )}
        {action.status !== 'Open' && !action.completedNote && completedAt && (
          <div className="action-meta">
            Completed {monthYear(completedAt.meetingDate)}
          </div>
        )}

        {mode === 'idle' && (
          <div className="action-row-actions">
            {action.status === 'Open' ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setMode('complete')}
                  disabled={submitting}
                >
                  Mark done
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setMode('drop')}
                  disabled={submitting}
                >
                  Drop
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={reopen}
                disabled={submitting}
              >
                Reopen
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMode('edit')}
              disabled={submitting}
            >
              Edit
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={onDelete}
              disabled={submitting}
            >
              Delete
            </button>
          </div>
        )}

        {mode === 'edit' && (
          <form className="form" onSubmit={submitEdit} style={{ marginTop: 10 }}>
            <label className="form-field">
              <span>Description</span>
              <textarea
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                autoFocus
              />
            </label>
            <div className="form-row">
              <label className="form-field">
                <span>Assignee</span>
                <input
                  type="text"
                  value={editAssignee}
                  onChange={(e) => setEditAssignee(e.target.value)}
                />
              </label>
              <label className="form-field">
                <span>Due hint</span>
                <input
                  type="text"
                  value={editDueHint}
                  onChange={(e) => setEditDueHint(e.target.value)}
                  placeholder="next meeting"
                />
              </label>
            </div>
            <SaveNotice state={save} />
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={submitting}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === 'complete' && (
          <form className="form" onSubmit={submitComplete} style={{ marginTop: 10 }}>
            <label className="form-field">
              <span>Completed at meeting (optional)</span>
              <select
                value={completedAtMeetingId}
                onChange={(e) => setCompletedAtMeetingId(e.target.value)}
              >
                <option value="">— Between meetings —</option>
                {sortedMeetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span>Note (optional)</span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
              />
            </label>
            <SaveNotice state={save} />
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Mark done'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={submitting}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === 'drop' && (
          <form className="form" onSubmit={submitDrop} style={{ marginTop: 10 }}>
            <label className="form-field">
              <span>Reason (optional)</span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
              />
            </label>
            <SaveNotice state={save} />
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Drop'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={reset} disabled={submitting}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </li>
  );
}

export function DecisionCard({
  decision,
  showItemLink = false,
}: {
  decision: Decision;
  showItemLink?: boolean;
}) {
  const updateDecision = useStore((s) => s.updateDecision);
  const deleteDecision = useStore((s) => s.deleteDecision);
  const items = useStore((s) => s.items);
  const itemTitle = showItemLink
    ? items.find((i) => i.id === decision.itemId)?.title
    : undefined;

  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(decision.summary);
  const [decisionType, setDecisionType] = useState<DecisionType>(decision.decisionType);
  const [motionBy, setMotionBy] = useState(decision.motionBy ?? '');
  const [secondBy, setSecondBy] = useState(decision.secondBy ?? '');
  const [vote, setVote] = useState(decision.vote ?? '');
  const [amountStr, setAmountStr] = useState(
    typeof decision.amount === 'number' ? String(decision.amount) : '',
  );
  const [vendor, setVendor] = useState(decision.vendor ?? '');
  const save = useSaveSubmit();

  const cancel = () => {
    setEditing(false);
    setSummary(decision.summary);
    setDecisionType(decision.decisionType);
    setMotionBy(decision.motionBy ?? '');
    setSecondBy(decision.secondBy ?? '');
    setVote(decision.vote ?? '');
    setAmountStr(typeof decision.amount === 'number' ? String(decision.amount) : '');
    setVendor(decision.vendor ?? '');
    save.clear();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let amount: number | null = null;
    if (amountStr.trim()) {
      const parsed = Number.parseFloat(amountStr.replace(/[^0-9.]/g, ''));
      if (Number.isNaN(parsed)) {
        save.setMessage('Amount must be a number, such as 1500 or 1712.50.');
        return;
      }
      amount = parsed;
    }
    const ok = await save.run(() =>
      updateDecision(decision.id, {
        summary,
        decisionType,
        motionBy,
        secondBy,
        vote,
        amount,
        vendor,
      }),
    );
    if (ok) setEditing(false);
  };

  const onDelete = async () => {
    if (!window.confirm(`Delete this decision?\n\n"${decision.summary}"`)) return;
    await save.run(() => deleteDecision(decision.id));
  };

  const submitting = save.submitting || save.blocked;

  if (editing) {
    return (
      <li className="decision-card">
        <form className="form" onSubmit={submit} style={{ margin: 0, padding: 0, border: 'none' }}>
          <label className="form-field">
            <span>Summary</span>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              autoFocus
            />
          </label>
          <div className="form-row">
            <label className="form-field">
              <span>Type</span>
              <select
                value={decisionType}
                onChange={(e) => setDecisionType(e.target.value as DecisionType)}
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
                value={vote}
                onChange={(e) => setVote(e.target.value)}
              />
            </label>
          </div>
          <div className="form-row">
            <label className="form-field">
              <span>Motion by</span>
              <input
                type="text"
                value={motionBy}
                onChange={(e) => setMotionBy(e.target.value)}
              />
            </label>
            <label className="form-field">
              <span>Second by</span>
              <input
                type="text"
                value={secondBy}
                onChange={(e) => setSecondBy(e.target.value)}
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
                inputMode="decimal"
              />
            </label>
            <label className="form-field">
              <span>Vendor</span>
              <input
                type="text"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </label>
          </div>
          <SaveNotice state={save} />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="decision-card">
      <div className="decision-head">
        <span className="badge">{decision.decisionType}</span>
        <span className="meta">{monthYear(decision.decisionDate)}</span>
      </div>
      <div className="decision-summary">{decision.summary}</div>
      {showItemLink && itemTitle && (
        <div className="action-meta" style={{ marginTop: 4 }}>
          <a href={itemHref(decision.itemId)}>{itemTitle}</a>
        </div>
      )}
      <div className="decision-meta">
        {decision.motionBy && (
          <span>
            <strong>Motion</strong> {decision.motionBy}
          </span>
        )}
        {decision.secondBy && (
          <span>
            <strong>Second</strong> {decision.secondBy}
          </span>
        )}
        {decision.vote && (
          <span>
            <strong>Vote</strong> {decision.vote}
          </span>
        )}
        {typeof decision.amount === 'number' && (
          <span>
            <strong>Amount</strong> {formatMoney(decision.amount)}
          </span>
        )}
        {decision.vendor && (
          <span>
            <strong>Vendor</strong> {decision.vendor}
          </span>
        )}
      </div>
      <SaveNotice state={save} />
      <div className="action-row-actions" style={{ marginTop: 8 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setEditing(true)}
          disabled={submitting}
        >
          Edit
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={onDelete}
          disabled={submitting}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
