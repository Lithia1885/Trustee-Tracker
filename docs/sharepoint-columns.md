# SharePoint columns added after the first release

Three optional columns carry the behaviour described in
[`docs/status.md`](status.md) and the pre-meeting update flow. The app
works without them — it drops them from writes and falls back, with the
reduced behaviour noted below — so they can be added whenever the site
admin gets to it. Add them by hand in the SharePoint list settings,
exactly as the original six lists were provisioned.

## MeetingEntries → `ReportedDate`

| | |
|---|---|
| Type | Date (date only) |
| Required | No |
| Internal name | `ReportedDate` |

When the information was reported or took effect, as distinct from the
meeting it is presented at.

**Without it:** every entry is treated as effective on its meeting
date. An update that arrives between meetings still saves, and still
attaches to the upcoming meeting, but it is ordered by the meeting date
rather than the day it was heard.

## MeetingEntries → `EntryKind`

| | |
|---|---|
| Type | Choice — `InMeeting`, `Premeeting` |
| Required | No (blank means `InMeeting`) |
| Internal name | `EntryKind` |

Whether the entry records what the meeting decided, or an update the
board already had going into it.

**Without it:** every entry is read as `InMeeting`. Updates added
between meetings are still recorded and still visible on the project,
but they print on the agenda **after** their meeting instead of on it —
the behaviour the app had before this column existed.

## Items → `DefaultSection`, new `OtherBusiness` choice

| | |
|---|---|
| Type | Choice — add `OtherBusiness` to the existing list |
| Required | Yes (the column already exists; only the choice is new) |
| Internal name | `DefaultSection` |

Parks a project in the Open Discussion slot at the end of the agenda,
outside Updates / Old / New. Open Discussion itself is the case it
exists for: standing, recurring, and not one of the numbered sections.

Unlike the columns below, **this one is not optional**. Until the choice
is added in the list settings, SharePoint rejects any save that sets it,
and a project already carrying the value reads back as `Auto` — which,
for a standing item, lands it in Updates. Add the choice before pinning
anything to it.

## Items → `BaselineStatus`

| | |
|---|---|
| Type | Choice — `Open`, `Tabled`, `Closed`, `Declined` |
| Required | No |
| Internal name | `BaselineStatus` |

The status a project held before any status event was recorded for it.
The app writes it once, automatically, the first time it records a
status change for that project. Nobody edits it by hand.

**Without it:** deleting or clearing a project's only status event
leaves the stored `Status` untouched rather than restoring a baseline.
The project detail page says so under **Status set by**.

---

## How the app behaves when a column is missing

A write that includes one of these columns is retried once without
them. SharePoint rejects such a write outright — nothing is stored —
so the retry cannot create a duplicate. If the retry succeeds, the
column is remembered as absent for the rest of the session, a warning
goes to the browser console, and the project page notes the reduced
behaviour where it matters.

## Existing records

Nothing needs migrating. Rows written before these columns existed read
back as `InMeeting` entries with no reported date and no baseline —
which is exactly what they are — so every agenda, status and printout
behaves as it did before.
