import { useMemo, useState } from 'react';
import { itemHref, navigateTo } from '../routing/hashRoute';
import { SaveNotice, useSaveSubmit } from './SaveNotice';
import { useStore, type ItemDraft } from '../store/useStore';
import {
  TAGS,
  type DefaultSection,
  type Item,
  type Tag,
} from '../types';

const DEFAULT_SECTIONS: DefaultSection[] = [
  'Auto',
  'Update',
  'OldBusiness',
  'NewBusiness',
  'OtherBusiness',
];

const SECTION_CHOICE_LABEL: Record<DefaultSection, string> = {
  Auto: 'Auto — let the history decide',
  Update: 'Updates',
  OldBusiness: 'Old business',
  NewBusiness: 'New business',
  OtherBusiness: 'Open discussion (end of the agenda)',
};

const EMPTY_DRAFT: ItemDraft = {
  title: '',
  standing: false,
  defaultSection: 'Auto',
  tags: [],
  assignedTo: '',
  firstRaisedDate: '',
  onHoldReason: '',
  deferredUntil: '',
  closedDate: '',
  closedReason: '',
  notes: '',
};

function itemToDraft(item: Item): ItemDraft {
  return {
    title: item.title,
    standing: item.standing,
    defaultSection: item.defaultSection,
    tags: item.tags,
    assignedTo: item.assignedTo ?? '',
    firstRaisedDate: item.firstRaisedDate ?? '',
    onHoldReason: item.onHoldReason ?? '',
    deferredUntil: item.deferredUntil ?? '',
    closedDate: item.closedDate ?? '',
    closedReason: item.closedReason ?? '',
    notes: item.notes ?? '',
  };
}

interface ItemFormProps {
  mode: 'create' | 'edit';
  itemId?: string;
}

export function ItemForm({ mode, itemId }: ItemFormProps) {
  const items = useStore((s) => s.items);
  const createItem = useStore((s) => s.createItem);
  const updateItem = useStore((s) => s.updateItem);

  const existing = mode === 'edit' && itemId ? items.find((i) => i.id === itemId) : undefined;
  const initial = useMemo(
    () => (existing ? itemToDraft(existing) : EMPTY_DRAFT),
    [existing],
  );

  const [draft, setDraft] = useState<ItemDraft>(initial);
  const save = useSaveSubmit();

  if (mode === 'edit' && !existing) {
    return (
      <main className="page">
        <a href="#" className="back-link">
          ← Agenda
        </a>
        <p className="empty">Item not found.</p>
      </main>
    );
  }

  const update = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const toggleTag = (tag: Tag) => {
    setDraft((d) => ({
      ...d,
      tags: d.tags.includes(tag) ? d.tags.filter((t) => t !== tag) : [...d.tags, tag],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      save.setMessage('Give the project a title before saving.');
      return;
    }
    await save.run(async () => {
      if (mode === 'create') {
        const created = await createItem(draft);
        navigateTo(itemHref(created.id));
      } else if (itemId) {
        await updateItem(itemId, draft);
        navigateTo(itemHref(itemId));
      }
    });
  };

  const cancel = () => {
    if (mode === 'edit' && itemId) {
      navigateTo(itemHref(itemId));
    } else {
      navigateTo('#');
    }
  };

  const backHref = mode === 'edit' && itemId ? itemHref(itemId) : '#';

  return (
    <main className="page">
      <a href={backHref} className="back-link">
        ← Back
      </a>
      <header className="page-header">
        <div>
          <div className="eyebrow">{mode === 'create' ? 'Add to registry' : 'Edit registry entry'}</div>
          <h1>{mode === 'create' ? 'New item' : 'Edit item'}</h1>
        </div>
      </header>
      {existing && (
        <div className="drift-banner" style={{ background: 'var(--surface-2)', color: 'var(--ink-2)', borderColor: 'var(--hairline-2)' }}>
          Status is <strong>{existing.status}</strong> — change via a meeting entry, not here.
        </div>
      )}
      <form className="form" onSubmit={submit}>
        <label className="form-field">
          <span>Title</span>
          <input
            type="text"
            value={draft.title}
            onChange={(e) => update('title', e.target.value)}
            autoFocus
            required
          />
        </label>

        <label className="form-field">
          <span>Assigned to</span>
          <input
            type="text"
            value={draft.assignedTo}
            onChange={(e) => update('assignedTo', e.target.value)}
            placeholder="Art Craddock, Men's Group"
          />
        </label>

        <div className="form-row">
          <label className="form-field">
            <span>Default section</span>
            <select
              value={draft.defaultSection}
              onChange={(e) => update('defaultSection', e.target.value as DefaultSection)}
            >
              {DEFAULT_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {SECTION_CHOICE_LABEL[s]}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Standing items always go to Updates, whatever is picked here —
              except Open discussion, which stays at the end.
            </span>
          </label>

          <label className="form-field form-checkbox">
            <input
              type="checkbox"
              checked={draft.standing}
              onChange={(e) => update('standing', e.target.checked)}
            />
            <span>Standing item (always in Updates)</span>
          </label>
        </div>

        <fieldset className="form-field">
          <legend>Tags</legend>
          <div className="tag-grid">
            {TAGS.map((t) => (
              <label key={t} className="tag-check">
                <input
                  type="checkbox"
                  checked={draft.tags.includes(t)}
                  onChange={() => toggleTag(t)}
                />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-row">
          <label className="form-field">
            <span>First raised date</span>
            <input
              type="date"
              value={draft.firstRaisedDate}
              onChange={(e) => update('firstRaisedDate', e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Deferred until</span>
            <input
              type="date"
              value={draft.deferredUntil}
              onChange={(e) => update('deferredUntil', e.target.value)}
            />
          </label>
        </div>

        <label className="form-field">
          <span>On-hold reason</span>
          <textarea
            rows={2}
            value={draft.onHoldReason}
            onChange={(e) => update('onHoldReason', e.target.value)}
            placeholder="When set, item routes to Tabled subsection."
          />
        </label>

        <div className="form-row">
          <label className="form-field">
            <span>Closed date</span>
            <input
              type="date"
              value={draft.closedDate}
              onChange={(e) => update('closedDate', e.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Closed reason</span>
            <input
              type="text"
              value={draft.closedReason}
              onChange={(e) => update('closedReason', e.target.value)}
            />
          </label>
        </div>

        <label className="form-field">
          <span>Background (markdown)</span>
          <textarea
            rows={6}
            value={draft.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="Standing reference facts. Not a status log."
          />
        </label>

        <SaveNotice state={save} />

        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={save.submitting || save.blocked}
          >
            {save.submitting
              ? 'Saving…'
              : mode === 'create'
                ? 'Create project'
                : 'Save changes'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={cancel}
            disabled={save.submitting}
          >
            Cancel
          </button>
        </div>
      </form>
    </main>
  );
}
