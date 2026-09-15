# CLAUDE.md — Trustee Tracker App

## Project

Web app for the Lithia Springs Methodist Church Board of Trustees. Monthly meetings produce agendas with three sections: **Updates** (standing operational items), **Old Business** (carried-forward items needing discussion), and **New Business** (items raised since last meeting). The app replaces scattered emails and Word docs with a single system where every project has a record, every meeting captures what was decided, and the monthly agenda generates itself.

Target users: 9 trustees + pastor + lay leader + admin council chair. Not public-facing.

## Design

Brand identity: [`docs/brand.md`](docs/brand.md) — the church's Libre
Caslon Text / National Park type, the deep green / teal / blue color
roles, contrast and voice conventions. It is the single source for
fonts and color; `:root` in `src/styles.css` is the single place they
are declared.

Layout spec: [`docs/design.md`](docs/design.md). Mobile-first
"Operations Desk" direction with a canonical section/status color map.
All component colors and radii derive from tokens — never hard-code per
component. Where the two documents disagree, `brand.md` wins.

How an installed copy keeps itself current — the hand-written service
worker, the derived build id, the caching policy and the one persistent
"Reload now" offer — is [`docs/updates.md`](docs/updates.md). The two
rules that matter: HTML is never served from cache while the network
works, and nothing reloads a running page without asking.

The printed packet (`src/agenda/pdf.ts`) keeps Helvetica and its own
layout. Application styling never changes an export. jsPDF writes an
incomplete font dictionary for the built-in fonts — a character range
with no widths behind it — which renders as overlapping glyphs in any
reader that does not carry its own copy of the Helvetica metrics.
`src/agenda/pdfFonts.ts` supplies the missing half; it is attached to
the document in `generateAgendaPdf` and must stay attached.

## Tech Stack

- React 18 + TypeScript, Vite
- Zustand for state management
- Microsoft Graph API for SharePoint Online list CRUD (no custom server)
- MSAL.js 2.x (`@azure/msal-browser`) for auth, single-tenant Azure AD app registration
- Static build deployed to a self-hosted web server behind Cloudflare
- PDF generation (Phase 4, not yet): jsPDF or React-PDF

## Architecture Principles

- **SharePoint lists are the data layer.** Six SharePoint lists (see schema below). MS Graph handles all reads and writes. No backend server, no database.
- **Event trail is the source of truth.** MeetingEntries are the history. `Item.Status` is derived from the latest status event **in event chronology** — not insertion order — with a deterministic tie-breaker, so backfilling old meetings cannot undo newer ones. The Item.Status column in SharePoint is a cache of that derivation, kept in sync by the app on every MeetingEntry write, edit and delete. The one implementation is `resolveItemStatus` in `src/domain/status.ts`; the rule, including the baseline that applies when no status event is left, is written up in [`docs/status.md`](docs/status.md).
- **A record is either saved or it is not, and the app says which.** Every create distinguishes a rejected write (nothing stored), a stored record whose follow-up work failed, and an outcome the network left unknown. An unknown outcome is reconciled by looking for the record, never by re-POSTing. See `src/store/saveError.ts`.
- **Zustand store hydrates from SharePoint on load, writes back on mutation.** Same pattern as the prayer-list app this is modeled after.
- **No mock data layer.** The app reads from and writes to real SharePoint lists. Seed data is provided below for initial SharePoint population, not for an in-memory fake.

## Azure Configuration

Fill these in before first run:

```
VITE_AZURE_TENANT_ID=__your_tenant_id__
VITE_AZURE_CLIENT_ID=__your_client_id__
VITE_SHAREPOINT_SITE_ID=__your_site_id__
VITE_SHAREPOINT_LIST_ITEMS=Items
VITE_SHAREPOINT_LIST_MEETINGS=Meetings
VITE_SHAREPOINT_LIST_MEETINGENTRIES=MeetingEntries
VITE_SHAREPOINT_LIST_DECISIONS=Decisions
VITE_SHAREPOINT_LIST_ACTIONITEMS=ActionItems
VITE_SHAREPOINT_LIST_VENDORS=Vendors
```

MSAL scopes needed: `Sites.ReadWrite.All` (or `Sites.Selected` if scoped to the target site). Redirect URI: `http://localhost:5173` for dev, production URL for deploy.

## SharePoint List Schema (Finalized)

Six lists. Provisioned by hand in the SharePoint admin UI. The app reads/writes using internal field names via Graph API.

### 1. Vendors

| Internal Name | Type | Required | Notes |
|---|---|---|---|
| Title | Single line of text | Yes | Company name. |
| ContactName | Single line of text | No | |
| Phone | Single line of text | No | |
| Trade | Single line of text | No | |
| Status | Choice | Yes | `Active`, `Inactive`, `Disputed`. Default: `Active`. |
| RelationshipNotes | Multiple lines of text (plain) | No | |

### 2. Items

| Internal Name | Type | Required | Notes |
|---|---|---|---|
| Title | Single line of text | Yes | Canonical item name. |
| Status | Choice | Yes | `Open`, `Tabled`, `Closed`, `Declined`. Default: `Open`. |
| Standing | Yes/No | Yes | Default: `No`. |
| DefaultSection | Choice | Yes | `Auto`, `Update`, `OldBusiness`, `NewBusiness`, `OtherBusiness`. Default: `Auto`. `OtherBusiness` parks the item in the Open Discussion slot at the end of the agenda. See [`docs/sharepoint-columns.md`](docs/sharepoint-columns.md). |
| Tags | Choice (multi-select) | No | `Building`, `Finance`, `Grounds`, `Security`, `HVAC`, `Accessibility`, `Furniture`, `FacilityUse`, `Budget`, `Vendors`, `Personnel`, `Technology`, `SafetySanctuary`. |
| AssignedTo | Single line of text | No | Free text. May be names or group labels like "Men's Group". |
| FirstRaisedDate | Date (date-only) | No | |
| FirstRaisedMeetingId | Lookup → Meetings (Title) | No | |
| ClosedDate | Date (date-only) | No | |
| ClosedReason | Multiple lines of text (plain) | No | |
| OnHoldReason | Multiple lines of text (plain) | No | When populated, agenda generator routes item to Tabled subsection. |
| DeferredUntil | Date (date-only) | No | When set and in the future, agenda generator suppresses the item. |
| Notes | Multiple lines of text (plain) | No | Evergreen notes not tied to a specific meeting. |
| BaselineStatus | Choice | No | `Open`, `Tabled`, `Closed`, `Declined`. Written by the app only, when a project's first status event is recorded. Restored when every status event is removed. Optional — see [`docs/sharepoint-columns.md`](docs/sharepoint-columns.md). |

### 3. Meetings

| Internal Name | Type | Required | Notes |
|---|---|---|---|
| Title | Single line of text | Yes | Format: `YYYY-MM-DD Regular` or `YYYY-MM-DD Special — Budget`. |
| MeetingDate | Date (date-only) | Yes | |
| MeetingType | Choice | Yes | `Regular`, `Special`. Default: `Regular`. |
| Location | Single line of text | No | |
| MembersPresent | Multiple lines of text (plain) | No | One name per line. |
| MembersAbsent | Multiple lines of text (plain) | No | |
| Guests | Multiple lines of text (plain) | No | |
| OpeningPrayerBy | Single line of text | No | |
| AdjournedAt | Single line of text | No | Free-form time string. |
| NextMeetingDate | Date (date-only) | No | |
| OpenCloseThisMonth | Single line of text | No | |
| OpenCloseNextMonth | Single line of text | No | |

### 4. MeetingEntries

| Internal Name | Type | Required | Notes |
|---|---|---|---|
| Title | Single line of text | Yes | App-synthesized: `YYYY-MM-DD — {ItemTitle}` (truncate to ~80 chars). |
| MeetingId | Lookup → Meetings (Title) | Yes | |
| MeetingDate | Date (date-only) | Yes | Denormalized from Meetings.MeetingDate. |
| ItemId | Lookup → Items (Title) | Yes | |
| Section | Choice | Yes | `Update`, `OldBusiness`, `NewBusiness`, `OtherBusiness`. Default: `OldBusiness`. |
| SortOrder | Number (integer) | Yes | Controls within-section ordering. Space by 10s (10, 20, 30). Default: `100`. |
| Narrative | Multiple lines of text (plain) | No | Stored as markdown. Rendered with react-markdown. |
| StatusChangeTo | Choice | No | `Open`, `Tabled`, `Closed`, `Declined`. Leave blank when no status transition. |
| ReportedDate | Date (date-only) | No | When the information was reported or took effect. Falls back to MeetingDate. Optional — see [`docs/sharepoint-columns.md`](docs/sharepoint-columns.md). |
| EntryKind | Choice | No | `InMeeting` (default, and what a blank means) or `Premeeting`. Distinguishes what the meeting decided from an update the board already had going in. Optional. |

### 5. Decisions

| Internal Name | Type | Required | Notes |
|---|---|---|---|
| Title | Single line of text | Yes | App-synthesized: `YYYY-MM-DD — {Summary truncated to 80 chars}`. |
| Summary | Single line of text | Yes | |
| MeetingEntryId | Lookup → MeetingEntries (Title) | Yes | |
| MeetingId | Lookup → Meetings (Title) | Yes | Denormalized. |
| ItemId | Lookup → Items (Title) | Yes | Denormalized. |
| DecisionDate | Date (date-only) | Yes | Denormalized from Meetings.MeetingDate. |
| DecisionType | Choice | Yes | `Approval`, `Denial`, `Authorization`, `Procedural`. Default: `Approval`. |
| MotionBy | Single line of text | No | |
| SecondBy | Single line of text | No | |
| Vote | Single line of text | No | "Unanimous" or "6-2-1" (for-against-abstain). |
| Amount | Currency | No | USD, 2 decimals. |
| Vendor | Single line of text | No | Free text, intentionally not a Lookup. |

### 6. ActionItems

| Internal Name | Type | Required | Notes |
|---|---|---|---|
| Title | Single line of text | Yes | App-synthesized: `YYYY-MM-DD — {Assignee}: {Description truncated to 60 chars}`. |
| Description | Multiple lines of text (plain) | Yes | |
| Assignee | Single line of text | Yes | Free text. |
| MeetingEntryId | Lookup → MeetingEntries (Title) | Yes | |
| ItemId | Lookup → Items (Title) | Yes | Denormalized. |
| AssignedAtMeetingId | Lookup → Meetings (Title) | Yes | Denormalized. |
| DueHint | Single line of text | No | Free text: "next meeting", "before May 19", etc. |
| Status | Choice | Yes | `Open`, `Done`, `Dropped`. Default: `Open`. |
| CompletedAtMeetingId | Lookup → Meetings (Title) | No | |
| CompletedNote | Multiple lines of text (plain) | No | |

## Agenda Generator Rules

The agenda generator is a pure function. Given Items and MeetingEntries, it produces a sorted agenda for a target meeting date.

**Which entries an agenda may see** (`isVisibleOnAgenda`, `src/domain/entries.ts`):

- A `Premeeting` entry appears on the agenda of the meeting it is attached to, provided its effective date (`ReportedDate` ?? `MeetingDate`) is on or before the target date. It never appears on an earlier agenda.
- An `InMeeting` entry appears only from the following agenda onward: what a meeting decides is not part of the agenda handed out at that meeting.

**What counts as a prior discussion** (`isPriorMeetingOutcome`): only `InMeeting` entries at meetings before the target date. A project first reported by email in September is still New Business in September.

Status is read through `resolveItemStatus`, not off the cached
`Item.Status` column, so a drifted cache can never put the agenda and
the reconciler in disagreement.

Classification logic for each open item, in this order:

1. If the resolved status is Closed or Declined → **skip** (do not show on agenda).
2. If `DeferredUntil` is set and is after the target meeting date → **skip** (returned in `agenda.deferred`).
3. If the resolved status is Tabled OR `OnHoldReason` is populated → **Tabled** subsection.
4. If `DefaultSection` is `OtherBusiness` → **Open Discussion**, the slot at the end of the agenda. This is checked before Standing because it is not a section preference: it says the item is not one of the three numbered sections at all.
5. If `Standing` is true → **Updates**. A standing item is a recurring report, not a piece of work with an end state, so it goes to Updates even when someone has pinned it elsewhere.
6. If `DefaultSection` is otherwise explicitly set (not Auto) → use that section.
7. If `DefaultSection` is Auto:
   - If the item has no prior MeetingEntries → **New Business**
   - Otherwise → **Old Business**

Within each section, sort by the `SortOrder` from the item's most recent prior meeting outcome, preserving last meeting's discussion order. Items without a prior entry sort to the end, then alphabetically by title.

Items suppressed by `DeferredUntil` are returned in `agenda.deferred` rather than dropped, so the printed follow-up pages can list them with their reason and revisit date.

Each agenda entry also carries:

- `summary` — the single status line for that project, selected by `selectStatusSummary`: the most recent update the board could have had by the target date, falling back to `Item.Notes`. **The agenda screen and the PDF both read this**; neither picks its own.
- `status` — the resolved status that placed it in its section.
- `stale` — true when the summary predates the meeting by more than two monthly cycles. A narrative is written in the present tense of the meeting that produced it, so the reader has to be able to see how old it is.

## Printed agenda rules

- **The body is trimmed, the follow-up is not.** Narratives are cut to a one- or two-line summary (`summarizeNarrative`) so the board can work from paper at the table; the untrimmed text is reprinted under FULL NOTES in the follow-up pages. Trimming is render-time only — nothing stored changes.
- **The trim keeps the outcome, not the opening.** A narrative is written as a story — why the matter came up, then what was said, then what the board did — so the first sentence is usually the least useful one in it. `summarizeNarrative` looks across the whole narrative for the last sentence carrying decision language (motion, seconded, carried, approved, cancelled, complete, declined, tabled, on hold and their kin) and prints that, with the opening sentence in front of it for subject context where there is room. With no such sentence it falls back to the opening, as before. The one implementation is shared by the packet and the agenda screen.
- **Every line carries the date of the entry behind it.** `(Aug 18)` for a recent one, `(no update since Apr 21)` when it is stale, `(not yet discussed)` when the text came from background notes.
- **The header names the date and time, never the room.** Where the board met is a fact for the minutes, recorded after the meeting; the agenda does not announce it. `Meeting.Location` still exists and is still edited and shown on the meeting record — it just does not reach the printed agenda.
- **A deadline is only called late when it is a date.** `DueHint` is free text; `parseDueDate` marks `— PAST DUE` only where the wording plainly contains a date that has gone by. "next meeting" is never flagged.

## Patterns to Avoid

These are lessons from the prayer-list app that would be wrong here:

- **Do not use a LastUpdated field as a recency proxy.** Recency is determined by the most recent MeetingEntry date, not by any field on the Item record.
- **Do not build merge semantics.** Items are atomic. No person-linking, no merge/unmerge.
- **Do not build maintenance/pastoral visibility filters.** All MeetingEntries are visible to all users.
- **Do not build a mock data layer.** No MockDataSource, no in-memory fake. The app talks to SharePoint from day one. If SharePoint lists aren't provisioned yet, the app shows an error state, not fake data.
- **Do not use SharePoint rich text fields.** All multi-line text fields are plain text. Narratives use markdown rendered by react-markdown.
- **Do not report a save as failed when the record may exist.** Re-POSTing after an ambiguous network error is how a board record ends up with the same update twice. Reconcile first.
- **Do not change the printed packet's typography or layout to match the app's.** Trustees read the paper; it stays familiar.
- **Do not reload a running page to apply an update.** A trustee writing up a meeting loses it. The worker never calls `skipWaiting()` on install; the page asks. See [`docs/updates.md`](docs/updates.md).
- **Do not announce an update in anything that disappears on a timer.** A toast that fades after four seconds is how a copy stays a month behind. The offer is a bar that waits.
- **Do not precache the whole assets directory.** The printing code is ~775 KB that most sessions never open. The precache list is read from the built `index.html`, not globbed.

## Phased Build Plan

### Phase 1 — Item registry + agenda view (target: before May 19, 2026)

Build the minimum that makes the next monthly meeting easier:

1. **MSAL auth.** Login page, token acquisition, silent refresh. Single-tenant, redirect-based.
2. **Graph utility layer.** Generic helpers for SharePoint list CRUD via MS Graph (`/sites/{siteId}/lists/{listName}/items`). Handle pagination, field mapping between SharePoint internal names and TypeScript types.
3. **Zustand store.** Hydrate Items, MeetingEntries, and ActionItems from SharePoint on app load. Expose create/update mutations that write through to SharePoint.
4. **Agenda view (landing page).** One page. Date picker for the target meeting date (default: next third Tuesday). Renders the auto-classified agenda in four sections: Updates, Old Business, New Business, Tabled. Each item shows title, assigned-to, tags, last-discussed date, open action count, and on-hold reason if applicable.
5. **Items list view.** Searchable, filterable list of all items. Filter by status and tag.
6. **Item detail view.** Shows all item fields plus timeline of MeetingEntries (empty until Phase 2 populates them), linked Decisions, and linked ActionItems.

The SharePoint Items list will be seeded by hand from the seed data below. The app reads it live.

### Phase 2 — Meeting recording (after May 19)

- Meeting create/edit form
- MeetingEntry recording UI: for each item discussed, capture Section, Narrative, SortOrder, StatusChangeTo
- ActionItem creation inline with meeting recording
- Decision creation inline with meeting recording
- Status drift detection: if Item.Status doesn't match the most recent non-null StatusChangeTo, surface a warning

### Phase 3 — Dashboards

- Action Item Dashboard: all open actions grouped by assignee
- Decision Log: filterable by date range, amount, type, vendor

### Phase 4 — PDF + vendor roster

- Monthly agenda PDF generator
- Vendor list view with status filtering

### Phase 5 — Backfill

- Historical MeetingEntry and Decision backfill from Oct 2025 – Apr 2026 minutes

## Future: Automated agenda distribution

A Power Automate flow will eventually send the monthly agenda to all
trustees and archive it. Mirror the working **Weekly Prayer List
Generator** flow rather than building a custom renderer.

### Why HTML, not Word

`Word → PDF` is a **premium connector**. We are not paying for that
license. The prayer-list flow works around this by:

1. Storing an **HTML template** in SharePoint (`/Shared Documents/Templates/`)
   with `{{PLACEHOLDER}}` slots.
2. Filling placeholders via chained `replace()` in a `Compose` action.
3. Writing the assembled HTML to OneDrive staging.
4. Using **`OneDrive: Convert file (using path)`** with `type: pdf` —
   which is a **standard** connector — to render the PDF.
5. Saving the PDF to a SharePoint document library and deleting the
   staging HTML.

Do not propose a Word template, an Azure Function, or a custom
renderer unless the licensing situation changes.

### Pattern (copy from prayer-list)

```
Recurrence (weekly, day-of-week + hour, Eastern Standard Time)
  ↓
SharePoint: Get items (Items list, filter "Status ne 'Closed' and Status ne 'Declined'")
SharePoint: Get items (MeetingEntries list, for prior-entries lookup + last narrative)
  ↓
Filter array x4   →   Select x4 (render <tr><td class="entry">…</td></tr>)
  for Updates / Old / New / (Tabled suppressed, like prayer list's empty-state)
  ↓
Compose x4 (join rows; emit "No items this section" fallback when empty)
  ↓
SharePoint: Get file content (HTML template by path)
  ↓
Compose: chained replace() to fill {{MEETING_DATE}}, {{UPDATES_ROWS}},
  {{OLD_ROWS}}, {{NEW_ROWS}}, {{OPEN_CLOSE}}, {{NEXT_MEETING}}
  ↓
OneDrive: Create file (/Agenda Staging/agenda_YYYYMMDD.html)
  ↓
Delay 15 seconds          ← required; OneDrive convert fails without this
  ↓
OneDrive: Convert file (path) → type: pdf
  ↓
SharePoint: Create file (/Agenda Archive/Trustees-Agenda-YYYYMMDD.pdf)
  ↓
Office 365 Outlook: Send email (V2) to the trustee distribution list,
  with a link to the Archive folder (same body shape as prayer-list)
  ↓
OneDrive: Delete file (staging HTML)
  ↓
[Failure path]: Send_Failure_Email → bart.arther@..., importance High,
  body explains manual fallback (reprint last month's PDF, or use chair's
  Word doc)
```

### Classification rules in Filter array

Translate the rules from `src/agenda/generator.ts` into Power Automate
expressions:

| Section | `Filter array` `where` |
|---|---|
| Skip | `equals(item()?['Status'], 'Closed') or equals(item()?['Status'], 'Declined')` — filter out before sectioning |
| Skip | `and(not(empty(item()?['DeferredUntil'])), greater(item()?['DeferredUntil'], targetDate))` |
| Tabled | `or(equals(item()?['Status'], 'Tabled'), not(empty(item()?['OnHoldReason'])))` |
| Open Discussion | `equals(item()?['DefaultSection'], 'OtherBusiness')` — remove before sectioning, render at the end |
| Updates | `equals(item()?['Standing'], true)` (after Tabled and Open Discussion removed) |
| Old | items with at least one `InMeeting` MeetingEntry where MeetingDate < targetDate |
| New | items with zero prior `InMeeting` MeetingEntries |

Order matters: Open Discussion first, then Standing, then a
`DefaultSection` other than `Auto`, then the prior-entries test. A
standing item goes to Updates even when pinned elsewhere.

The narrative the flow prints for an item is the same selection the app
makes: the most recent entry visible to that agenda, else `Item.Notes`.
"Visible" means a `Premeeting` entry whose `ReportedDate` (or
`MeetingDate`) is on or before the target date, or an `InMeeting` entry
whose `MeetingDate` is strictly before it. Filtering on `MeetingDate <
targetDate` alone drops the pre-meeting updates the agenda exists to
carry.

### Template placeholders

| Token | Source |
|---|---|
| `{{MEETING_DATE}}` | `formatDateTime(triggerOutputs() targetDate, 'MMMM d, yyyy')` |
| `{{MEETING_TIME}}` | `'6 PM'` — no room; see the printed agenda rules above |
| `{{PRIOR_MEETING_MONTH}}` | most recent Meeting where MeetingDate < target, `formatDateTime(..., 'MMMM yyyy')` |
| `{{OPEN_CLOSE}}` | `'Open/Close: ' + thisMonthName + ', ' + Meeting.OpenCloseThisMonth + ' – ' + nextMonthName + ', ' + Meeting.OpenCloseNextMonth` |
| `{{UPDATES_ROWS}}` / `{{OLD_ROWS}}` / `{{NEW_ROWS}}` | joined `<tr>` output from each section's `Select` |
| `{{NEXT_MEETING}}` | `Meeting.NextMeetingDate ?? next third Tuesday after target` |

Tabled is deliberately not in the template — the chair's typed
agendas never list it and the trustees use the app for tabled items.

### Gotchas inherited from the prayer-list flow

- **15-second `Delay`** before `Convert file` — OneDrive needs time to
  see the freshly written HTML, otherwise convert returns "not found".
- **`Send_Failure_Email`** must list every preceding action with
  `runAfter: { Failed, TimedOut }` so any single-step failure routes
  to one alert.
- HTML template lives in SP `/Shared Documents/Templates/` so the
  admin can edit it without touching the flow.

## Seed Data

### Items (24 open + 4 closed)

Use this to seed the SharePoint Items list. `FirstRaisedMeetingId` can be left null until Meetings are created in Phase 2.

```
1. Interior Door Security Windows | Open | Standing: No | DefaultSection: Auto | Tags: Security, Building | Assigned: Art Craddock, Men's Group | FirstRaised: 2025-10-01 | Notes: Moved to men's group work list. Two installed, two more to order.

2. Handicap Parking Signs | Open | Standing: No | DefaultSection: Auto | Tags: Accessibility, Grounds | Assigned: Art Craddock, Men's Group | FirstRaised: 2025-10-21 | Notes: Signs and posts in hand, moved to men's group work list.

3. Handicap Rails in Restrooms | Open | Standing: No | DefaultSection: Auto | Tags: Accessibility, Building | Assigned: Scott Bragg, Men's Group | FirstRaised: 2025-10-21 | Notes: 9 sets of 24-inch grab bars needed (6 main + 1 behind sanctuary + 2 children's wing). Rails purchased, not yet installed.

4. First Aid Kits | Open | Standing: No | DefaultSection: Auto | Tags: SafetySanctuary | Assigned: Art Craddock, Cynthia | FirstRaised: 2025-10-01 | Notes: No update at last meeting. Art following up.

5. LED Lighting and Thermostats | Open | Standing: No | DefaultSection: Auto | Tags: Building, Technology | Assigned: Art Craddock | FirstRaised: 2025-10-01 | Notes: Matrix ES / Gary Horton unresponsive. ~20 lights + thermostats remaining.

6. Children's Wing Furniture Disposal | Open | Standing: No | DefaultSection: Auto | Tags: Furniture, Building | Assigned: Joey Skinner | FirstRaised: 2025-10-21 | Notes: Plan: sell at yard sale (first weekend of May), then free pickup, then dispose. Ghana donation declined ($4K shipping not feasible).

7. Doorbell Camera (Front Office) | Open | Standing: No | DefaultSection: Auto | Tags: Security, Technology | Assigned: Bart Arther, Mike Davis | FirstRaised: 2025-10-21 | Notes: Camera in hand, installation targeted in coming weeks.

8. CE Mitchell Tutoring Program | Open | Standing: Yes | DefaultSection: Update | Tags: FacilityUse | Assigned: Jane Carter, Pat Smith | FirstRaised: 2025-10-01 | Notes: Running well. Mon/Tue/Thu 5-6 PM.

9. Children's Wing Carpet Cleaning | Tabled | Standing: No | DefaultSection: Auto | Tags: Building, Grounds | Assigned: Art Craddock | FirstRaised: 2025-10-21 | OnHoldReason: Tabled pending decision on clean vs. replace with hard flooring. | Notes: Quotes on file: Squeaky Clean $749, ANAGO $951.25. Last discussed Mar 2026.

10. Fellowship Hall Chairs (Donation) | Open | Standing: No | DefaultSection: Auto | Tags: Furniture, Building | Assigned: Bart Arther | FirstRaised: 2026-01-20 | Notes: NPS 8500 samples arrived; comfortable but plastic glides scratch LVP. Donor committed ~120; board wants 160 (4x40 packs, ~$11,860 Sam's Club). Glide problem must be resolved before bulk order.

11. Chapel Awning | Tabled | Standing: No | DefaultSection: Auto | Tags: Building | Assigned: Julian Carter | FirstRaised: 2026-01-20 | OnHoldReason: On hold pending cash position. Revisit Jun/Jul. | DeferredUntil: 2026-06-01 | Notes: Extreme Images quote $1,712 approved Mar 2026 but not yet executed.

12. Pastor's Office Carpet | Open | Standing: No | DefaultSection: Auto | Tags: Building | Assigned: Pastor Thomas Long | FirstRaised: 2026-01-20 | Notes: Carpet tile approach under investigation. Waiting on Buddy Laughridge's contacts. Room ~17ft square; carpet rolls 12ft wide so tiles preferred. Donated funds available.

13. Harness Capital Campaign (HVAC Fundraising) | Open | Standing: Yes | DefaultSection: Update | Tags: HVAC, Budget | Assigned: Scott Bragg | FirstRaised: 2026-01-20 | Notes: CD funds released ($12K Harness, $18K engineering, $10.5K building, ~$40.5K savings). Harness fee ~$1,500/month. Two-pronged: congregational giving + external grants/sponsorships.

14. Elevator Emergency Phone (Ooma AirDial) | Open | Standing: No | DefaultSection: Auto | Tags: Technology, SafetySanctuary | Assigned: Bart Arther | FirstRaised: 2026-02-17 | Notes: Approved unanimously Mar 2026 ($55/month + $375 install, dual-path, 16hr battery). Contract stalled on vendor side over address correction.

15. Second Floor Water Fountain | Open | Standing: No | DefaultSection: Auto | Tags: Building | Assigned: Karl Leymann, Art Craddock | FirstRaised: 2026-02-17 | Notes: Repair abandoned after third component (cooler) failed. Replacement $800-$1,000. Art to raise with Finance Committee for CD fund allocation.

16. Soffit Repair and Painting | Closed | Standing: No | DefaultSection: Auto | Tags: Building | Assigned: Alberto | FirstRaised: 2026-01-20 | ClosedDate: 2026-04-21 | ClosedReason: Project complete. Alberto completed main building soffits and children's wing canopy plywood. | Notes: Follow-up item: cracked sheeting above children's wing canopy leaking (tar patch on men's group list).

17. K-Mac Electrical Invoice | Open | Standing: No | DefaultSection: Auto | Tags: Budget, Vendors | Assigned: Bill Camp | FirstRaised: 2026-01-20 | Notes: Original ~$22K, resubmitted $19K, paid $12K, balance ~$7K in dispute. Bill requesting itemized change order descriptions; offered split-the-difference.

18. CE Mitchell Summer Coding Camp | Open | Standing: No | DefaultSection: Auto | Tags: FacilityUse | Assigned: Art Craddock | FirstRaised: 2026-03-17 | Notes: Approved unanimously. Mon-Thu 9 AM-3 PM, June 8 - July 16, up to 20 students. Suspended during VBS week. Key access being coordinated, insurance clarification pending.

19. Bradford Pear Removal | Open | Standing: No | DefaultSection: Auto | Tags: Grounds | Assigned: Bart Arther, Paul Wilkerson | FirstRaised: 2026-04-21 | Notes: Norfolk Southern verbally non-objecting; written confirmation required before work begins. May involve Douglas County DOT or men's group with rented chipper.

20. Third Floor / Sanctuary Heat - Return Piping Failure | Open | Standing: No | DefaultSection: Auto | Tags: HVAC, Building | Assigned: Art Craddock, Karl Leymann | FirstRaised: 2026-04-21 | Notes: Boiler shut down/drained. No heat to 3rd floor or sanctuary; AC unaffected. No immediate repair (system will be replaced under HVAC project). Karl proposed isolating 3rd floor return. Space heaters available as winter backup.

21. Roof Inspection | Open | Standing: No | DefaultSection: Auto | Tags: Building | Assigned: Art Craddock | FirstRaised: 2026-04-21 | Notes: Alberto observed bubbling/aging shingles, offered introduction to roofing contractor. Insurance-based job possible.

22. Fellowship Hall Kitchen Door - Water Intrusion | Open | Standing: No | DefaultSection: Auto | Tags: Building | Assigned: Men's Group | FirstRaised: 2026-04-21 | Notes: Water observed under entry rug despite no rain. Possible sources: hot water heater, ice maker, below-floor leak.

23. Shed Cleanout | Open | Standing: No | DefaultSection: Auto | Tags: Building, Grounds | Assigned: Art Craddock, Kevin Livingston | FirstRaised: 2025-10-21 | Notes: Art and Kevin meeting Saturday to sort contents. Puppetry materials to Ghana via Kwame's container.

24. Children's Wing Canopy - Tar Patch | Open | Standing: No | DefaultSection: Auto | Tags: Building | Assigned: Men's Group | FirstRaised: 2026-04-21 | Notes: Cracked sheeting leaking above newly-replaced plywood. 1-2 gallons tar patch needed.

25. Cross Lights | Closed | ClosedDate: 2025-10-21 | ClosedReason: Installation complete.

26. Sanctuary Carpet | Closed | ClosedDate: 2025-11-18 | ClosedReason: Installation complete; Men's Group funded.

27. 2026 Budget | Closed | Tags: Budget, Finance | ClosedDate: 2025-12-16 | ClosedReason: Approved at special meeting (~$121,700).

28. Next Step Learning Academy Daycare Proposal | Declined | Tags: FacilityUse | ClosedDate: 2026-03-17 | ClosedReason: Proposal declined - septic, insurance, and programming conflicts.
```

### Vendors (11)

```
1. Matrix ES | Contact: Gary Horton | Trade: LED lighting / thermostats | Status: Inactive | Notes: Unresponsive since late 2025.
2. Alberto | Contact: Alberto | Trade: Painting, soffit repair | Status: Active | Notes: Preferred vendor for exterior work. Will price-match.
3. Ben Hill Roofing | Contact: James | Trade: Roofing, exterior repair | Status: Active
4. K-Mac Electrical | Contact: Glen's son | Trade: Electrical | Status: Disputed | Notes: Outstanding invoice dispute (~$7K). Glen (father) did work without invoicing; son's invoicing practices differ.
5. TKE Elevator Company | Trade: Elevator service / monitoring | Status: Active
6. Extreme Images LLC | Trade: Awning fabrication | Status: Active | Notes: Job #4307526, quote $1,712 (Chapel Awning).
7. Squeaky Clean | Trade: Carpet cleaning | Status: Active | Notes: $749 quote on file (children's wing).
8. ANAGO | Trade: Carpet cleaning | Status: Active | Notes: $951.25 quote on file (children's wing).
9. Ooma | Trade: Elevator emergency phone | Status: Active | Notes: AirDial: $55/month + $375 install.
10. Harness | Contact: Scott Bragg (primary internal contact) | Trade: Capital campaign fundraising | Status: Active | Notes: ~$1,500/month consulting fee.
11. CE Mitchell | Trade: Tutoring and summer coding camp | Status: Active
```

### Trustee Roster (2026)

Art Craddock (Chair), Karl Leymann (Vice Chair), Bart Arther (Secretary), Jane Carter, Joey Skinner, Bill Camp, Mike Davis, Paul Wilkerson, Pat Smith

Regular guests: Pastor Thomas Long, Julian Carter (Admin Council Chair), Scott Bragg (Lay Leader)

Jane Carter and Pat Smith are exempt from Sunday open/close rotation due to the heavy parking gate.

## Graph API Field Mapping Notes

SharePoint Lookup fields return as `{fieldName}LookupId` (integer) in Graph responses. Multi-choice fields return as `{fieldName}@odata.type: Collection(Edm.String)` arrays. Yes/No fields are boolean. Currency fields are decimal numbers. Date fields return ISO strings.

When creating/updating items via Graph, use the internal field names with `fields` prefix:

```
PATCH /sites/{siteId}/lists/{listId}/items/{itemId}
{
  "fields": {
    "Title": "Interior Door Security Windows",
    "Status": "Open",
    "Standing": false,
    "DefaultSection": "Auto",
    "Tags": ["Security", "Building"],
    "AssignedTo": "Art Craddock, Men's Group"
  }
}
```

For Lookup fields, set `{fieldName}LookupId` to the target item's SharePoint row ID (integer).
