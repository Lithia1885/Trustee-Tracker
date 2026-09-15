import type {
  ActionItem,
  ActionStatus,
  Decision,
  DecisionType,
  DefaultSection,
  EntryKind,
  EntrySection,
  Item,
  ItemStatus,
  Meeting,
  MeetingEntry,
  MeetingType,
  Tag,
} from '../types';

export interface GraphListItem<F = Record<string, unknown>> {
  id: string;
  fields: F;
}

const ITEM_STATUSES: readonly ItemStatus[] = ['Open', 'Tabled', 'Closed', 'Declined'];
const DEFAULT_SECTIONS: readonly DefaultSection[] = [
  'Auto',
  'Update',
  'OldBusiness',
  'NewBusiness',
  'OtherBusiness',
];
const ENTRY_SECTIONS: readonly EntrySection[] = [
  'Update',
  'OldBusiness',
  'NewBusiness',
  'OtherBusiness',
];
const ENTRY_KINDS: readonly EntryKind[] = ['InMeeting', 'Premeeting'];
const ACTION_STATUSES: readonly ActionStatus[] = ['Open', 'Done', 'Dropped'];
const DECISION_TYPES: readonly DecisionType[] = [
  'Approval',
  'Denial',
  'Authorization',
  'Procedural',
];
const MEETING_TYPES: readonly MeetingType[] = ['Regular', 'Special'];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asDate(value: unknown): string | undefined {
  const s = asString(value);
  if (!s) return undefined;
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function asLookupId(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  return String(value);
}

function asTags(value: unknown): Tag[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is Tag => typeof v === 'string' && v.length > 0) as Tag[];
  }
  if (typeof value === 'string' && value.length > 0) {
    return [value as Tag];
  }
  return [];
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

interface ItemFields {
  Title?: string;
  Status?: string;
  Standing?: boolean;
  DefaultSection?: string;
  Tags?: unknown;
  AssignedTo?: string;
  FirstRaisedDate?: string;
  FirstRaisedMeetingIdLookupId?: number | string;
  ClosedDate?: string;
  ClosedReason?: string;
  OnHoldReason?: string;
  DeferredUntil?: string;
  Notes?: string;
  BaselineStatus?: string;
}

export function mapItem(row: GraphListItem<ItemFields>): Item {
  const f = row.fields ?? {};
  return {
    id: row.id,
    title: asString(f.Title) ?? '(untitled)',
    status: oneOf(f.Status, ITEM_STATUSES, 'Open'),
    standing: asBool(f.Standing),
    defaultSection: oneOf(f.DefaultSection, DEFAULT_SECTIONS, 'Auto'),
    tags: asTags(f.Tags),
    assignedTo: asString(f.AssignedTo),
    firstRaisedDate: asDate(f.FirstRaisedDate),
    firstRaisedMeetingId: asLookupId(f.FirstRaisedMeetingIdLookupId),
    closedDate: asDate(f.ClosedDate),
    closedReason: asString(f.ClosedReason),
    onHoldReason: asString(f.OnHoldReason),
    deferredUntil: asDate(f.DeferredUntil),
    notes: asString(f.Notes),
    // Absent until the column is provisioned, or until this project's
    // first status event captures it.
    baselineStatus: asString(f.BaselineStatus)
      ? oneOf(f.BaselineStatus, ITEM_STATUSES, 'Open')
      : undefined,
  };
}

interface MeetingEntryFields {
  Title?: string;
  MeetingIdLookupId?: number | string;
  MeetingDate?: string;
  ItemIdLookupId?: number | string;
  Section?: string;
  SortOrder?: number | string;
  Narrative?: string;
  StatusChangeTo?: string;
  ReportedDate?: string;
  EntryKind?: string;
}

export function mapMeetingEntry(row: GraphListItem<MeetingEntryFields>): MeetingEntry {
  const f = row.fields ?? {};
  const statusChangeTo = asString(f.StatusChangeTo);
  return {
    id: row.id,
    title: asString(f.Title) ?? '(untitled)',
    meetingId: asLookupId(f.MeetingIdLookupId) ?? '',
    meetingDate: asDate(f.MeetingDate) ?? '',
    itemId: asLookupId(f.ItemIdLookupId) ?? '',
    section: oneOf(f.Section, ENTRY_SECTIONS, 'OldBusiness'),
    sortOrder: asNumber(f.SortOrder, 100),
    narrative: asString(f.Narrative),
    statusChangeTo: statusChangeTo
      ? oneOf(statusChangeTo, ITEM_STATUSES, 'Open')
      : undefined,
    reportedDate: asDate(f.ReportedDate),
    // Rows written before these columns existed are meeting outcomes,
    // which is exactly what 'InMeeting' means.
    kind: oneOf(f.EntryKind, ENTRY_KINDS, 'InMeeting'),
  };
}

interface ActionItemFields {
  Title?: string;
  Description?: string;
  Assignee?: string;
  MeetingEntryIdLookupId?: number | string;
  ItemIdLookupId?: number | string;
  AssignedAtMeetingIdLookupId?: number | string;
  DueHint?: string;
  Status?: string;
  CompletedAtMeetingIdLookupId?: number | string;
  CompletedNote?: string;
}

interface MeetingFields {
  Title?: string;
  MeetingDate?: string;
  MeetingType?: string;
  Location?: string;
  MembersPresent?: string;
  MembersAbsent?: string;
  Guests?: string;
  OpeningPrayerBy?: string;
  AdjournedAt?: string;
  NextMeetingDate?: string;
  OpenCloseThisMonth?: string;
  OpenCloseNextMonth?: string;
}

export function mapMeeting(row: GraphListItem<MeetingFields>): Meeting {
  const f = row.fields ?? {};
  return {
    id: row.id,
    title: asString(f.Title) ?? '(untitled)',
    meetingDate: asDate(f.MeetingDate) ?? '',
    meetingType: oneOf(f.MeetingType, MEETING_TYPES, 'Regular'),
    location: asString(f.Location),
    membersPresent: asString(f.MembersPresent),
    membersAbsent: asString(f.MembersAbsent),
    guests: asString(f.Guests),
    openingPrayerBy: asString(f.OpeningPrayerBy),
    adjournedAt: asString(f.AdjournedAt),
    nextMeetingDate: asDate(f.NextMeetingDate),
    openCloseThisMonth: asString(f.OpenCloseThisMonth),
    openCloseNextMonth: asString(f.OpenCloseNextMonth),
  };
}

interface DecisionFields {
  Title?: string;
  Summary?: string;
  MeetingEntryIdLookupId?: number | string;
  MeetingIdLookupId?: number | string;
  ItemIdLookupId?: number | string;
  DecisionDate?: string;
  DecisionType?: string;
  MotionBy?: string;
  SecondBy?: string;
  Vote?: string;
  Amount?: number | string;
  Vendor?: string;
}

export function mapDecision(row: GraphListItem<DecisionFields>): Decision {
  const f = row.fields ?? {};
  const amount = typeof f.Amount === 'number'
    ? f.Amount
    : typeof f.Amount === 'string' && f.Amount.length > 0
      ? Number(f.Amount)
      : undefined;
  return {
    id: row.id,
    title: asString(f.Title) ?? '(untitled)',
    summary: asString(f.Summary) ?? '',
    meetingEntryId: asLookupId(f.MeetingEntryIdLookupId) ?? '',
    meetingId: asLookupId(f.MeetingIdLookupId) ?? '',
    itemId: asLookupId(f.ItemIdLookupId) ?? '',
    decisionDate: asDate(f.DecisionDate) ?? '',
    decisionType: oneOf(f.DecisionType, DECISION_TYPES, 'Approval'),
    motionBy: asString(f.MotionBy),
    secondBy: asString(f.SecondBy),
    vote: asString(f.Vote),
    amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
    vendor: asString(f.Vendor),
  };
}

export function mapActionItem(row: GraphListItem<ActionItemFields>): ActionItem {
  const f = row.fields ?? {};
  return {
    id: row.id,
    title: asString(f.Title) ?? '(untitled)',
    description: asString(f.Description) ?? '',
    assignee: asString(f.Assignee) ?? '',
    meetingEntryId: asLookupId(f.MeetingEntryIdLookupId) ?? '',
    itemId: asLookupId(f.ItemIdLookupId) ?? '',
    assignedAtMeetingId: asLookupId(f.AssignedAtMeetingIdLookupId) ?? '',
    dueHint: asString(f.DueHint),
    status: oneOf(f.Status, ACTION_STATUSES, 'Open'),
    completedAtMeetingId: asLookupId(f.CompletedAtMeetingIdLookupId),
    completedNote: asString(f.CompletedNote),
  };
}
