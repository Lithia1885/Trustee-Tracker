import { useMemo, useState } from 'react';
import {
  STATUS_PILL,
  avatarBg,
  initials,
  monthYear,
  parseAssignees,
  tagDisplay,
  tagPillStyle,
} from '../design/tokens';
import { itemHref, newItemHref } from '../routing/hashRoute';
import { useStore } from '../store/useStore';
import type { Item, ItemStatus, MeetingEntry, Tag } from '../types';
import { TAGS } from '../types';

const ALL_STATUSES: ItemStatus[] = ['Open', 'Tabled', 'Closed', 'Declined'];
const DEFAULT_STATUSES: ItemStatus[] = ['Open', 'Tabled'];

export function ItemsList() {
  const items = useStore((s) => s.items);
  const meetingEntries = useStore((s) => s.meetingEntries);

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<Set<ItemStatus>>(
    () => new Set(DEFAULT_STATUSES),
  );
  const [tagFilter, setTagFilter] = useState<Set<Tag>>(() => new Set());

  const latestByItem = useMemo(() => {
    const m = new Map<string, MeetingEntry>();
    for (const e of meetingEntries) {
      const prev = m.get(e.itemId);
      if (
        !prev ||
        e.meetingDate > prev.meetingDate ||
        (e.meetingDate === prev.meetingDate && e.sortOrder > prev.sortOrder)
      ) {
        m.set(e.itemId, e);
      }
    }
    return m;
  }, [meetingEntries]);

  const statusCounts = useMemo(() => {
    const c: Record<ItemStatus, number> = { Open: 0, Tabled: 0, Closed: 0, Declined: 0 };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => statusFilter.has(i.status))
      .filter((i) => {
        if (tagFilter.size === 0) return true;
        return i.tags.some((t) => tagFilter.has(t));
      })
      .filter((i) => {
        if (!q) return true;
        return i.title.toLowerCase().includes(q);
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [items, statusFilter, tagFilter, query]);

  const toggleStatus = (s: ItemStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const toggleTag = (t: Tag) => {
    setTagFilter((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Registry</div>
          <h1>Items</h1>
        </div>
        <a href={newItemHref} className="btn-fab" aria-label="New item">
          +
        </a>
      </header>

      <input
        type="search"
        placeholder="Search items by title…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: '100%',
          font: 'inherit',
          fontSize: 14,
          padding: '10px 12px',
          border: '1px solid var(--hairline-2)',
          borderRadius: 10,
          background: 'var(--surface)',
          color: 'var(--ink)',
          marginBottom: 12,
        }}
      />

      <div className="chip-row">
        {ALL_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${statusFilter.has(s) ? 'active' : ''}`}
            onClick={() => toggleStatus(s)}
          >
            {s} <span style={{ opacity: 0.7 }}>{statusCounts[s]}</span>
          </button>
        ))}
      </div>

      <div className="chip-row" style={{ marginBottom: 18 }}>
        {TAGS.map((t) => {
          const active = tagFilter.has(t);
          return (
            <button
              key={t}
              type="button"
              className={`chip ${active ? 'active' : ''}`}
              onClick={() => toggleTag(t)}
              style={
                active
                  ? undefined
                  : tagPillStyle(t)
              }
            >
              {tagDisplay(t)}
            </button>
          );
        })}
        {tagFilter.size > 0 && (
          <button
            type="button"
            className="chip"
            onClick={() => setTagFilter(new Set())}
          >
            Clear tags
          </button>
        )}
      </div>

      <div className="meta" style={{ marginBottom: 10 }}>
        {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
      </div>

      {filtered.length === 0 ? (
        <p className="empty">No items match.</p>
      ) : (
        <ul className="meeting-card-list">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              latest={latestByItem.get(item.id)}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function ItemCard({ item, latest }: { item: Item; latest?: MeetingEntry }) {
  const statusStyle = STATUS_PILL[item.status];
  const assignees = parseAssignees(item.assignedTo).slice(0, 2);
  const tags = item.tags.slice(0, 4);
  const tagOverflow = item.tags.length - tags.length;
  return (
    <li>
      <a href={itemHref(item.id)} className="meeting-card">
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 2,
          }}
        >
          <span
            className="status-pill"
            style={{ background: statusStyle.bg, color: statusStyle.fg }}
          >
            {item.status}
          </span>
          {item.standing && <span className="badge">Standing</span>}
          {assignees.length > 0 && (
            <span
              className="avatars"
              style={{ marginLeft: 'auto', paddingTop: 0 }}
            >
              {assignees.map((name) => (
                <span
                  key={name}
                  className="avatar"
                  style={{
                    background: avatarBg(name),
                    width: 22,
                    height: 22,
                    fontSize: 9.5,
                  }}
                  title={name}
                >
                  {initials(name)}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="meeting-title">{item.title}</div>
        {tags.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 5,
              marginTop: 4,
            }}
          >
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
          </div>
        )}
        <div className="meeting-meta" style={{ marginTop: 6 }}>
          {latest ? (
            <span>Last discussed {monthYear(latest.meetingDate)}</span>
          ) : item.firstRaisedDate ? (
            <span>Raised {monthYear(item.firstRaisedDate)}</span>
          ) : null}
          {item.closedDate && <span>Closed {monthYear(item.closedDate)}</span>}
          {item.onHoldReason && <span>On hold</span>}
        </div>
      </a>
    </li>
  );
}
