import type { ActionItem, Item, MeetingEntry } from '../types';

export function makeItem(overrides: Partial<Item> & { id: string; title: string }): Item {
  return {
    status: 'Open',
    standing: false,
    defaultSection: 'Auto',
    tags: [],
    ...overrides,
  };
}

export function makeEntry(
  overrides: Partial<MeetingEntry> & { id: string; itemId: string; meetingDate: string },
): MeetingEntry {
  return {
    title: `${overrides.meetingDate} — entry`,
    meetingId: `m-${overrides.meetingDate}`,
    section: 'OldBusiness',
    sortOrder: 100,
    kind: 'InMeeting',
    ...overrides,
  };
}

export function makeAction(
  overrides: Partial<ActionItem> & { id: string; description: string },
): ActionItem {
  return {
    title: overrides.description,
    assignee: 'Art Craddock',
    meetingEntryId: 'e1',
    itemId: 'i1',
    assignedAtMeetingId: 'm1',
    status: 'Open',
    ...overrides,
  };
}
