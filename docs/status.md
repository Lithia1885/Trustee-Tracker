# How a project's status is decided

`Item.Status` in SharePoint is a **cache**. The meeting entries are the
record. Everything that reads or writes status goes through
`resolveItemStatus` in `src/domain/status.ts`, so the agenda, the
reconciler and the drift warning on a project page can never disagree.

## The rule

1. Take every meeting entry for the project that carries a
   `StatusChangeTo`.
2. Order them by **when they happened**, not by when they were typed
   in. The status is the last one.
3. If no status event is left, fall back to the **baseline** — the
   status the project held before any event was recorded.
4. If there is no baseline either, the stored `Status` stands.

### Ordering, precisely

Entries are ordered by, in order:

1. **Effective date** — `ReportedDate` when set, otherwise the meeting
   date.
2. **Kind** — a pre-meeting update comes before that meeting's own
   outcome. The board had it before the meeting started.
3. **SortOrder** — the meeting's own discussion order.
4. **Record ID**, compared as a number.

Steps 2–4 are the tie-breaker, and every one of them is deterministic,
so two entries dated the same day always resolve the same way no matter
what order they came back from SharePoint.

### Why chronology and not insertion order

The secretary backfills. A July entry closes a project; June's history
gets typed up in September. Reading the trail in insertion order would
reopen the project. Reading it in event chronology does not.

## The baseline

The first time the app records a status change for a project, it also
writes that project's current status to `BaselineStatus` — capturing
where things stood before the trail said anything. Delete or clear that
last status event later and the project returns to its baseline rather
than to an arbitrary default.

For a project whose events were already there before this rule existed
— or a legacy record closed by hand in 2025 that nobody ever typed
history for — there is no knowable baseline, and the app does **not**
guess one. The stored status stands, and the project page says where it
came from under **Status set by**:

| Shown | Means |
|---|---|
| The update of September 3 | A recorded status event decided it |
| Where it stood before any update was recorded | The baseline applied |
| The project record — no update has changed it | Nothing in the trail speaks to status |

A closed 2025 project never reopens itself because its history was
never typed in.

## When the cache drifts

If `Item.Status` disagrees with the resolved status, the project page
shows a banner naming both and offering to set it. Any entry the app
creates, edits or deletes runs the same reconciliation automatically;
the banner is for records changed outside the app, and for a
reconciliation that was interrupted.
