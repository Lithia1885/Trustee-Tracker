import type { AgendaSection, EntrySection, ItemStatus, Tag } from '../types';

export const TAG_COLORS: Record<Tag, string> = {
  Building: '#8a6a3b',
  Finance: '#3d6b5a',
  Grounds: '#5d7a3a',
  Security: '#7a3a3a',
  HVAC: '#9a5a2a',
  Accessibility: '#3a5a7a',
  Furniture: '#7a5a3a',
  FacilityUse: '#5a4a7a',
  Budget: '#3d6b5a',
  Vendors: '#6a4a3a',
  Personnel: '#7a3a5a',
  Technology: '#3a6a7a',
  SafetySanctuary: '#9a3a3a',
};

export const SECTION_COLOR: Record<AgendaSection, string> = {
  Update: 'var(--sage)',
  OldBusiness: 'var(--amber)',
  NewBusiness: 'var(--rose)',
  Tabled: 'var(--ink-3)',
};

export const ENTRY_SECTION_COLOR: Record<EntrySection, string> = {
  Update: 'var(--sage)',
  OldBusiness: 'var(--amber)',
  NewBusiness: 'var(--rose)',
  OtherBusiness: 'var(--ink-3)',
};

export const STATUS_PILL: Record<ItemStatus, { bg: string; fg: string }> = {
  Open: { bg: 'var(--sage-soft)', fg: 'var(--sage)' },
  Tabled: { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  Closed: { bg: '#eaeaea', fg: '#666' },
  Declined: { bg: 'var(--rose-soft)', fg: 'var(--rose)' },
};

export const SECTION_LABEL: Record<AgendaSection, string> = {
  Update: 'Updates',
  OldBusiness: 'Old business',
  NewBusiness: 'New business',
  Tabled: 'Tabled',
};

export const ENTRY_SECTION_LABEL: Record<EntrySection, string> = {
  Update: 'Updates',
  OldBusiness: 'Old business',
  NewBusiness: 'New business',
  OtherBusiness: 'Other business',
};

export const SECTION_SUB: Record<AgendaSection, string> = {
  Update: 'Standing reports',
  OldBusiness: 'Carried forward',
  NewBusiness: 'Raised since last meeting',
  Tabled: 'On hold',
};

export function tagDisplay(tag: Tag): string {
  if (tag === 'SafetySanctuary') return 'Safety / Sanctuary';
  if (tag === 'FacilityUse') return 'Facility use';
  return tag;
}

export function hexAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function tagPillStyle(tag: Tag): React.CSSProperties {
  const c = TAG_COLORS[tag];
  return { background: hexAlpha(c, 0.1), color: c };
}

const AVATAR_PALETTE = ['#4a6b54', '#b87333', '#4a5d7a', '#7a4a6b', '#6b5a3a', '#3a6a6a'];

export function parseAssignees(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

export function avatarBg(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function shortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function monthYear(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function longDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function eyebrowDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    .toUpperCase();
}

export function formatMoney(n: number | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  const hasCents = Math.round(n * 100) !== Math.round(n) * 100;
  return `$${n.toLocaleString('en-US', {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}
