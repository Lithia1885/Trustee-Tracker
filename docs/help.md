# Trustee Tracker — How to Use This App

A plain-language guide to what this app does and how to get around. If something here doesn't match what you see on screen, the app has changed — tell Bart.

---

## What is this app for?

It is one place to keep track of every project, repair, and decision the Trustees deal with. Instead of digging through emails and old Word docs, you record what happened at each meeting, and the app builds next month's agenda for you.

You can use it to:

- See the agenda for the next meeting (auto-built from what's open).
- Look up the history of any item — who's working on it, what was decided, what's still owed.
- Record what happened at a meeting (narrative, decisions, action items) as you go.
- Find a past decision (how much did we approve for X? who motioned?).
- Check which action items are still outstanding and who owes what.

It is **not** a public site. Only Trustees, the pastor, the lay leader, and the admin council chair sign in.

---

## Signing in

You sign in with your **church Microsoft 365 account** (the same one you use for church email). The first time you sign in on a device, Microsoft may ask you to confirm permission for the app to read and write the Trustees SharePoint lists. Approve it.

The app stays signed in across browser refreshes. If it logs you out (token expired), just sign back in — nothing is lost.

Your email shows in the top-right with a **Sign out** button.

---

## The five screens

The app has five main screens. On desktop they are tabs down the left side. On phone they are icons across the bottom.

| Tab | What's on it |
|---|---|
| **Agenda** | The auto-built agenda for a meeting date you pick. This is the home screen. |
| **Meetings** | List of every meeting, past and upcoming. Click one to record what happened. |
| **Actions** | All action items, grouped by who owes them. |
| **Items** | The full registry of every tracked project, searchable and filterable. |
| **Decisions** | Audit log of every motion ever recorded. Search and filter. |

---

## Common tasks

### Look at the agenda for an upcoming meeting

1. Open the app — you land on **Agenda**.
2. The date picker at the top defaults to the next third Tuesday. Change it if you want a different meeting.
3. The agenda is split into **Updates**, **Old Business**, **New Business**, **Open Discussion**, and **Tabled**. Tap a section tab to filter, or stay on **All**.
4. Each row shows the item title, a short note, who's assigned, tags, when it was last discussed, and how many open action items it has.
5. If nobody has reported on something for more than two meetings, the row says **no update since** that month, in amber. The note you're reading is that old — treat it accordingly.
5. Tap any row to open the item's full history.

### Print or share the agenda

On the Agenda screen, tap **Print agenda**. It downloads a PDF named with the meeting date. You can email it or print it. Nobody needs an account to read it.

The agenda itself is deliberately short: each project gets a line or two, so you can work from it at the table. Every line is stamped with the date of the note behind it — `(Aug 18)` for something reported last month, `(no update since Apr 21)` when nothing has come in for a while, `(not yet discussed)` when the text is background rather than a meeting note.

The header gives the date and the time, and does not name a room — where the board actually met is something the secretary records in the minutes afterwards. **Location** on the meeting record is still there for that, and still shows on the meeting page.

Next to the date picker there's a checkbox, **Add follow-up pages to the printout**, on by default. It adds a clearly labelled **Follow-up** section after the agenda:

- Every open action item, grouped by who owes it, with the project and the due wording exactly as it was typed. Work nobody has taken is listed on its own under "Not assigned to anyone yet".
- Every project that's waiting — tabled, on hold, or deferred — with its reason and revisit date.
- **Full notes** — the complete narrative behind every line of the agenda, untrimmed, in agenda order. Nothing is lost by the short agenda; it's all here.

Done and dropped actions never appear. A due date is marked **PAST DUE** only when the wording actually contains a date and that date has gone by — "before 2026-09-01" gets flagged on a 15 September agenda, "next meeting" never does. Untick the box if you want the agenda alone, the way the chair has always typed it.

### Add a brand-new item to the registry

1. From the Agenda or Items screen, tap the blue **+** button (top right).
2. Fill in the title — that's the only required field. Everything else is optional.
3. Pick tags, an assignee, a first-raised date, etc.
4. **Standing item?** Check the box if this is something that comes up every meeting (like CE Mitchell Tutoring). Standing items always appear under Updates.
5. **Default section** is usually **Auto** — the app picks the right section based on the item's history. Override it only to force where something appears. **Open discussion** parks an item in the slot at the end of the agenda instead of one of the three numbered sections.

Note that **Standing** wins over Default section: a standing item always goes to Updates, because it's a recurring report rather than a project with an end. The one exception is Open discussion, which stays at the end.
6. Hit **Create**. You land on the item's detail page.

### Record what happened at a meeting

You have two ways to do this. Pick whichever feels easier.

**Option A — from the meeting screen (best when you're capturing several items at once):**

1. Tap **Meetings**, then either pick an existing meeting or tap **+** to create one (just the date and type).
2. On the meeting screen, tap **Add entry**.
3. Pick the item from the dropdown. Items that already have an entry in this meeting are marked with a ✓.
4. Choose the section (Update / Old Business / New Business / Other Business).
5. If the status changed (e.g., something got closed or tabled), pick that under **Status change**. Otherwise leave it blank.
6. Type the narrative — what was said, what got decided, what's next. Markdown works (`**bold**`, `- bullets`, etc.).
7. Save. Repeat for the next item.

Once an entry exists, you can attach **action items** and **decisions** to it right there on the meeting screen.

**Option B — from the item screen (best for news that arrives between meetings):**

1. Open the item from the Items list or Agenda.
2. Tap **Add an update for the &lt;date&gt; meeting**.
3. Type what happened.
4. **Date reported** defaults to today — change it to the day you actually heard it. That date is what decides where the update sits in the project's history.
5. Set a status change if needed. Save.

The difference between the two matters on paper. An entry recorded from the **meeting** screen is what the board decided that night, so it prints on the *next* meeting's agenda. An update added from the **item** screen is news the board has going in, so it prints on *that* meeting's agenda — which is how "Waiting on the vendor" stops being the September line when the contractor confirmed a date on September 3.

If there's no upcoming meeting yet, saving creates the next regular meeting and attaches the update to it. The form says so before you save.

### Record a decision (a motion)

A decision lives inside a meeting entry, so do this from the meeting screen after the entry is added:

1. Find the entry on the meeting screen and tap **+ Decision**.
2. Summary is required ("Approved Ooma AirDial install" or similar).
3. Pick the type — Approval, Denial, Authorization, or Procedural.
4. Vote can be plain text: "Unanimous" or "6-2-1" (for-against-abstain).
5. Motion by / Second by / Amount / Vendor — fill what you have. The Amount field accepts `$1,500` or `1500`, either works.
6. Add decision.

Decisions show up in the Decision Log forever and stay linked to the item.

### Assign an action item

Same flow as a decision — from the meeting screen, find the entry and tap **+ Action item**:

1. Describe what needs to happen.
2. Assignee defaults to whoever the item is assigned to. Change it if someone else is taking this one.
3. Due hint is free text: "next meeting", "before May 19", "after Easter" — whatever makes sense.
4. Add action.

### Mark an action item done

1. Go to the **Actions** screen.
2. Find the action under the assignee's name (or use the filter chips up top).
3. Tap **Mark done**.
4. Optional: pick the meeting where it was reported done, and add a note ("Installed and tested 5/14"). Either or both can be blank.
5. Done. The action moves out of the Open filter.

You can also **Drop** an action (we decided not to do it after all) or **Reopen** something that came back.

### Close an item

When a project is finished:

1. Open the item.
2. Tap **Add update** and write the final narrative.
3. Set **Status change** to **Closed**.
4. Save.

Or edit the item directly and set Closed Date / Closed Reason. Either works; the narrative is nicer because it shows up in the timeline.

### Tabling an item

Two ways:

- **Soft pause:** edit the item and fill in **On-hold reason** ("Waiting on insurance"). The item still shows up — but under the Tabled section, with the reason visible. This is the right choice for "we'll come back to it next month."
- **Hard pause:** also set **Deferred until** to a date in the future. Until that date, the item disappears from the agenda entirely. Use this for "revisit in June."

To bring it back, edit the item and clear those two fields.

### Find a past decision

Open **Decisions**. You can:

- Type in the search box (matches summary, vendor, motion by, second by).
- Filter by type (Approval, Denial, Authorization, Procedural).
- Set a date range.
- Set a minimum dollar amount ("show me everything over $1,000").

Filters stack. Clear them with the **Clear filters** button.

---

## Tips and tricks

- **Markdown works** in narratives, item notes, and decision summaries. `**bold**`, `*italic*`, `- bullets`, `> quotes`, and `[link text](https://example.com)` all render. You don't have to use it.
- **Status follows the history, in date order.** An item's status comes from the most recent status change in its history — by *when it happened*, not when you typed it. So you can backfill June in September without undoing what July recorded. If the stored status disagrees, you'll see a banner naming both with a one-click fix. The project page also shows **Status set by**, so you can see which update decided it.
- **Deleting the last status change puts the status back.** If you clear or delete the only entry that set a status, the item goes back to where it stood before the app started tracking it — it does not reset to Open. For old records that were never typed up, the stored status simply stands; the page says so.
- **Sort order in a section** comes from the previous meeting's discussion order. If you want to reorder, edit a meeting entry's **Sort order** field (smaller numbers go first; the default is 100, so use 10 / 20 / 30 to put something at the top).
- **Standing items** always go under Updates, regardless of history or of what Default section says. Use it for things like CE Mitchell Tutoring, the capital campaign, or the treasury figures — anything that gets a status report every month rather than finishing.
- **The agenda is trimmed on purpose.** A long narrative shows as a line or two on the agenda — the sentence that says what was decided, with the opening sentence in front of it where there is room. The whole thing is reprinted under **Full notes** in the follow-up pages. Nothing you typed is shortened or changed in the record — only what's printed on that page.
- **The next-third-Tuesday default** assumes regular meetings. If you're working on a special meeting, just change the date.
- **Mobile works.** The whole app is designed phone-first. You can record a meeting from your phone during the meeting if that's easier than a laptop.
- **Search the Items registry** to find anything by name. Filters for status and tags stack on top of the search.
- **Action items survive entry deletes.** If you delete a meeting entry that has action items or decisions attached, those records stick around but lose the back-link. The app warns you before this happens.
- **One item, many entries.** Each meeting an item is discussed produces a new MeetingEntry. The item's history page shows them all in reverse order, newest first.
- **"Other Business" section** on the meeting screen exists for items that came up but don't fit any of the agenda categories. They don't appear on the printed agenda but stay in the meeting record.

---

## What to do if something looks wrong

- **The agenda is missing an item I expected.** Check: is it Closed or Declined? Is **Deferred until** set to a future date? Either of those hides it. Open the item and check.
- **An item is in the wrong section.** If it's a recurring report showing under Old Business, tick **Standing** — that alone moves it to Updates. Otherwise change its **Default section**, or leave it and the next meeting entry will put it where you want.
- **A note on the agenda is out of date.** The agenda reprints the most recent thing recorded, which is the right behaviour — the date next to the title tells you how old that is. Add an update to replace it.
- **I made a typo in a meeting entry.** Open the meeting, find the entry, tap **Edit entry**. Same for decisions and action items.
- **I want to delete a meeting entry.** Open the meeting, edit the entry, scroll to **Delete entry**. Confirm. The linked actions and decisions stay but unlink — usually fine, but be aware.
- **I'm getting an error / blank screen.** Try the **Try again** button. If that doesn't work, refresh the page. If that still doesn't work, tell Bart and include what you were doing.

### When a save goes wrong

The app tells you exactly what happened to the record, because the right thing to do next is different in each case. Read the heading:

- **Not saved.** Nothing reached SharePoint. Your text is still in the form — fix whatever it names and press Save again.
- **Saved — one step left.** The record is safely in SharePoint, but something after it didn't finish (usually applying the status, or reloading the screen). Press **Finish saving**. Do **not** type it in again; you'd end up with two copies.
- **Not sure this was saved.** The connection dropped before we heard back. Press **Check again** — the app looks in SharePoint to see whether it landed, instead of sending it a second time. Don't re-type it until it tells you.
- **Already saving.** You pressed Save twice. Give it a moment.

---

## Glossary

- **Item** — a project, repair, or topic the Trustees are tracking. The registry is the list of all items.
- **Meeting** — a single Trustees meeting. Has a date, type (Regular / Special), and a list of entries.
- **Entry** (or "meeting entry") — what was discussed about one item at one meeting. The narrative goes here.
- **Decision** — a motion that passed (or failed). Linked to an entry.
- **Action item** — something assigned to someone with a deadline. Linked to an entry.
- **Standing item** — something that always appears under Updates (recurring operational topic).
- **Tabled** — paused. Either soft (on-hold reason) or hard (deferred until a date).
- **Open discussion** — the standing slot at the end of the agenda, for business that isn't one of the three numbered sections.
- **Drift** — when the item's stored status disagrees with what the history says.
- **Pre-meeting update** — news recorded between meetings and carried onto the next agenda, as opposed to what the board decided at a meeting.
