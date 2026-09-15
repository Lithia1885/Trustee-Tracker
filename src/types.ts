export type ItemStatus = 'Open' | 'Tabled' | 'Closed' | 'Declined';

/**
 * Where a project is pinned on the agenda, or `Auto` to let its history
 * decide. `OtherBusiness` parks it outside the three numbered sections
 * — it renders in the Open Discussion slot at the end.
 */
export type DefaultSection =
  | 'Auto'
  | 'Update'
  | 'OldBusiness'
  | 'NewBusiness'
  | 'OtherBusiness';

export type AgendaSection =
  | 'Update'
  | 'OldBusiness'
  | 'NewBusiness'
  | 'OtherBusiness'
  | 'Tabled';

export type EntrySection = 'Update' | 'OldBusiness' | 'NewBusiness' | 'OtherBusiness';

/**
 * Whether an entry records what a meeting decided, or an update that
 * arrived before that meeting and is being carried into it.
 *
 * Legacy rows written before the EntryKind column existed read back as
 * `InMeeting`, which is what they were.
 */
export type EntryKind = 'InMeeting' | 'Premeeting';

export const TAGS = [
  'Building',
  'Finance',
  'Grounds',
  'Security',
  'HVAC',
  'Accessibility',
  'Furniture',
  'FacilityUse',
  'Budget',
  'Vendors',
  'Personnel',
  'Technology',
  'SafetySanctuary',
] as const;

export type Tag = (typeof TAGS)[number];

export type MeetingType = 'Regular' | 'Special';

export type DecisionType = 'Approval' | 'Denial' | 'Authorization' | 'Procedural';

export type ActionStatus = 'Open' | 'Done' | 'Dropped';

export type VendorStatus = 'Active' | 'Inactive' | 'Disputed';

export interface Item {
  id: string;
  title: string;
  status: ItemStatus;
  standing: boolean;
  defaultSection: DefaultSection;
  tags: Tag[];
  assignedTo?: string;
  firstRaisedDate?: string;
  firstRaisedMeetingId?: string;
  closedDate?: string;
  closedReason?: string;
  onHoldReason?: string;
  deferredUntil?: string;
  notes?: string;
  /**
   * The status this project had before the app recorded any status
   * event for it. Restored when every status event is removed or
   * cleared, so deleting history never silently reopens a closed
   * project. See docs/status.md.
   */
  baselineStatus?: ItemStatus;
}

export interface Meeting {
  id: string;
  title: string;
  meetingDate: string;
  meetingType: MeetingType;
  location?: string;
  membersPresent?: string;
  membersAbsent?: string;
  guests?: string;
  openingPrayerBy?: string;
  adjournedAt?: string;
  nextMeetingDate?: string;
  openCloseThisMonth?: string;
  openCloseNextMonth?: string;
}

export interface MeetingEntry {
  id: string;
  title: string;
  meetingId: string;
  meetingDate: string;
  itemId: string;
  section: EntrySection;
  sortOrder: number;
  narrative?: string;
  statusChangeTo?: ItemStatus;
  /**
   * When the information was reported or took effect. Defaults to the
   * meeting date when absent, which is what every legacy row means.
   */
  reportedDate?: string;
  kind: EntryKind;
}

export interface Decision {
  id: string;
  title: string;
  summary: string;
  meetingEntryId: string;
  meetingId: string;
  itemId: string;
  decisionDate: string;
  decisionType: DecisionType;
  motionBy?: string;
  secondBy?: string;
  vote?: string;
  amount?: number;
  vendor?: string;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: string;
  meetingEntryId: string;
  itemId: string;
  assignedAtMeetingId: string;
  dueHint?: string;
  status: ActionStatus;
  completedAtMeetingId?: string;
  completedNote?: string;
}

export interface Vendor {
  id: string;
  title: string;
  contactName?: string;
  phone?: string;
  trade?: string;
  status: VendorStatus;
  relationshipNotes?: string;
}
