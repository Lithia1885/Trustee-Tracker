import { useMemo, useState } from 'react';
import { nextThirdTuesday, toIsoDate } from '../agenda/nextMeeting';
import { eyebrowDate, monthYear } from '../design/tokens';
import { meetingHref } from '../routing/hashRoute';
import { useStore, type MeetingDraft } from '../store/useStore';
import { SaveNotice, useSaveSubmit } from './SaveNotice';
import type { Meeting, MeetingEntry, MeetingType } from '../types';

const MEETING_TYPES: MeetingType[] = ['Regular', 'Special'];

function emptyDraft(): MeetingDraft {
  return {
    meetingDate: toIsoDate(nextThirdTuesday(new Date())),
    meetingType: 'Regular',
    titleSuffix: '',
  };
}

function entryCountFor(meetingId: string, entries: MeetingEntry[]): number {
  return entries.filter((e) => e.meetingId === meetingId).length;
}

export function MeetingsList() {
  const meetings = useStore((s) => s.meetings);
  const meetingEntries = useStore((s) => s.meetingEntries);
  const createMeetingFromDraft = useStore((s) => s.createMeetingFromDraft);

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<MeetingDraft>(emptyDraft);
  const save = useSaveSubmit();

  const sorted = useMemo(
    () => meetings.slice().sort((a, b) => b.meetingDate.localeCompare(a.meetingDate)),
    [meetings],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.meetingDate) {
      save.setMessage('Pick the meeting date before saving.');
      return;
    }
    await save.run(async () => {
      const created = await createMeetingFromDraft(draft);
      window.location.hash = meetingHref(created.id).slice(1);
    });
  };

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Meeting records</div>
          <h1>Meetings</h1>
        </div>
        <button
          type="button"
          className="btn-fab"
          aria-label="New meeting"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? '×' : '+'}
        </button>
      </header>

      {showForm && (
        <form className="form" onSubmit={submit}>
          <div className="form-row">
            <label className="form-field">
              <span>Date</span>
              <input
                type="date"
                value={draft.meetingDate}
                onChange={(e) => setDraft({ ...draft, meetingDate: e.target.value })}
                autoFocus
              />
            </label>
            <label className="form-field">
              <span>Type</span>
              <select
                value={draft.meetingType}
                onChange={(e) =>
                  setDraft({ ...draft, meetingType: e.target.value as MeetingType })
                }
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
            <span>Title suffix (optional)</span>
            <input
              type="text"
              value={draft.titleSuffix ?? ''}
              onChange={(e) => setDraft({ ...draft, titleSuffix: e.target.value })}
              placeholder="Budget"
            />
          </label>
          <SaveNotice state={save} />
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={save.submitting || save.blocked}
            >
              {save.submitting ? 'Creating…' : 'Create meeting'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setShowForm(false);
                setDraft(emptyDraft());
                save.clear();
              }}
              disabled={save.submitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <p className="empty">No meetings yet.</p>
      ) : (
        <ul className="meeting-card-list">
          {sorted.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              entryCount={entryCountFor(m.id, meetingEntries)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function MeetingCard({
  meeting,
  entryCount,
}: {
  meeting: Meeting;
  entryCount: number;
}) {
  return (
    <li>
      <a href={meetingHref(meeting.id)} className="meeting-card">
        <div className="eyebrow" style={{ marginBottom: 0 }}>
          {eyebrowDate(meeting.meetingDate)} · {meeting.meetingType}
        </div>
        <div className="meeting-title">{meeting.title}</div>
        <div className="meeting-meta">
          <span>{monthYear(meeting.meetingDate)}</span>
          <span>
            {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
          </span>
          {meeting.location && <span>{meeting.location}</span>}
        </div>
      </a>
    </li>
  );
}
