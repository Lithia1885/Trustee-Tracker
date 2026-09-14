# Trustee Tracker — Design Spec

Direction B ("Operations Desk"), mobile-first.

The Lithia Springs identity — fonts, color roles, states and voice —
is in [`docs/brand.md`](brand.md) and takes precedence over anything
in this file that contradicts it.

The visual prototype lives in `Trustee Tracker - Mobile B.html` /
`Trustee Tracker - Directions.html`.

---

## 1. Design tokens

**The palette and type are the church's, and they live in
[`docs/brand.md`](brand.md).** That file is the single source for
fonts, color roles, contrast, states and voice; `:root` in
`src/styles.css` is the single place they are declared. This section
records only how those tokens map onto the agenda's own vocabulary.

### Section + status color

`--sage` is gone; the accent is the church's teal.

| Section       | Token       | Meaning                          |
|---------------|-------------|----------------------------------|
| Updates       | `--teal`    | standing, healthy                |
| Old business  | `--amber`   | carried forward, needs attention |
| New business  | `--rose`    | fresh, raised since last meeting |
| Tabled        | `--ink-3`   | on hold, deprioritized           |

Section color is always rendered as a small square dot (8×8, 2px radius)
next to the section title, never as a fill behind the heading.

### Tag color palette

Each `Tag` in `src/types.ts` gets a stable hex — a categorical palette,
unchanged by the identity pass. Used as a colored dot (5–7px circle) or
as a tinted pill (`background: rgba(hex, 0.10); color: hex;
font-weight: 600`). Every one clears 4.5:1 at that tint.

```js
const TAG_COLORS = {
  Building:        '#8a6a3b',
  Finance:         '#3d6b5a',
  Grounds:         '#5d7a3a',
  Security:        '#7a3a3a',
  HVAC:            '#9a5a2a',
  Accessibility:   '#3a5a7a',
  Furniture:       '#7a5a3a',
  FacilityUse:     '#5a4a7a',
  Budget:          '#3d6b5a',
  Vendors:         '#6a4a3a',
  Personnel:       '#7a3a5a',
  Technology:      '#3a6a7a',
  SafetySanctuary: '#9a3a3a',
};
```

### Type

Two families: **Libre Caslon Text** for page and project titles,
**National Park** for everything you work in. Sizes and roles:

| Role                 | Size | Family | Weight | Notes                   |
|----------------------|------|--------|--------|-------------------------|
| Page title (H1)      | 24/30 | serif | 400    | "May 19 agenda"         |
| Detail title (H1)    | 25   | serif  | 400    | item.title              |
| Section H2 (eyebrow) | 12   | sans   | 600 +0.08em uppercase | "Updates" |
| Eyebrow / breadcrumb | 10.5 | sans   | 500 +0.12em uppercase |           |
| Body                 | 13.5–14 | sans | 400   | notes, fact values      |
| Meta                 | 11–12 | sans  | 400/500 | dates, counts         |
| Numbers (stats)      | 22   | sans   | 600 `tabular-nums` |            |
| Tag pill text        | 10.5–11 | sans | 600 +0.01em |                  |
| Status pill text     | 9.5–10.5 | sans | 700 +0.06em uppercase |     |

Numbers must use `font-variant-numeric: tabular-nums`.

### Radii & spacing

| Token            | Value | Use                                   |
|------------------|-------|---------------------------------------|
| `radius-pill`    | 999px | tag pills, filter chips, FAB          |
| `radius-card`    | 12px  | content cards, fact list              |
| `radius-row`     | 10px  | row hover/press states                |
| `radius-control` | 6px   | buttons, inputs, selects              |
| `radius-tag`     | 4px   | status pills (Urgent, Dispute, Status)|
| `radius-sheet`   | 20px 20px 0 0 | bottom sheet                  |

Touch targets are never smaller than **44×44px**. Bottom-sheet handle is
38×4 with 4px radius. Horizontal page padding on phone is **16px**;
vertical row padding is 12 (compact) or 14 (comfortable).

---

## 2. Component patterns

### Topbar (per-screen)

```
┌────────────────────────────────────────┐
│ TUE · 19 MAY · 7:00 PM · FELLOWSHIP H. │  eyebrow 10.5px, ink-3, +0.12em
│ May 19 agenda                      [+] │  H1 24px Caslon, FAB 38px blue
└────────────────────────────────────────┘
```

The FAB on the right is the primary action for the screen — `+` on the
agenda (new item), `Edit` on item detail. No back-button chrome on
the top-level Agenda screen.

### Stat strip

Horizontal-scroll row of `MStatChip`. Each chip:
- 88px min width, 12px radius
- Number 22px 700, in the section's semantic color
- Label 11px 500, `--ink-2`
- Active state = 12% tint of color + 30% border

Scrolls under thumb; doesn't snap. The stat values double as filters.

### Filter chips

Below the stat strip. Pill row, single-tap to filter.
- Idle: `--surface` bg, `--hairline-2` border, `--ink-2` text
- Active: `--ink` bg, white text, no border-color shift

### Agenda row

```
┌─────────────────────────────────────────────┐
│ 🟢🟢  K-Mac Electrical Invoice  [DISPUTE]   │
│       Balance ~$7K in dispute. Bill         │
│       requested itemized change-order…      │
│       [Budget] [Vendors] [$7,000]   Apr 21 ·1↻│
└─────────────────────────────────────────────┘
```

- Avatars left, 28×28 circles, max 2, -8px overlap, 2px surface border
- Title 14.5/600, `--ink`, `textWrap: pretty`
- Note clamped to **2 lines** (`-webkit-line-clamp: 2`)
- Tags as tinted pills, money as accent-tinted pill
- Last meta line right-aligns date + action count, shrinks before tags

### Item detail

- Status pill ("OPEN · OLD BUSINESS") above title — uppercase 10.5/700,
  4px radius, teal-soft bg
- Tag pills on a line below title
- Facts card: rows of `Label / Value` divided by hairlines, 14px row text
- Primary CTA: full-width button, `--blue`, 13px padding, 6px radius
- **History** timeline: 2px vertical rail at left, 12px circles at each
  entry. Most-recent entry gets a filled accent dot; older entries get
  hollow surface + hairline-2 border.
- **Action items** card below: 22×22 checkbox-style empty box on the
  left, title 13.5/500, meta 11.5 `--ink-3`

### Add-update bottom sheet

- Backdrop: `rgba(0,0,0,0.35)` + 2px blur
- Sheet: `--surface`, 20px top radius, drop shadow `0 -8px 32px rgba(0,0,0,0.18)`
- 38×4 drag handle, 4px from top
- Three-column header: `Cancel` (text button, `--ink-3`) — title — `Save` (filled blue pill)
- "Attaching to" strip uses `--surface-2` with the section-color dot
- Status change: equal-width segmented control of 5 options, first is
  "No change" filled `--ink`. Single-line, 11.5/600.

### Bottom tab bar (phone only)

`Agenda · Items · Actions · People`. 4 items, equal width.
- 68px tall including 26px home-indicator safe-area
- Background `rgba(255,255,255,0.92)` + `backdrop-filter: blur(12px)`
- Hairline top border
- Active item color is the brand accent

---

## 3. Mobile breakpoints

Single phone layout up to ~600px wide. Above 600px, the desktop
"Operations Desk" layout applies: left rail replaces the bottom tab
bar, stat strip becomes a 4-up grid, rows gain an assignee column on
the right, and the add-update form moves inline instead of being a
sheet.

```css
@media (min-width: 720px) {
  /* show left rail, hide bottom tab bar */
}
```

---

## 4. Section + status mapping (canonical)

Always derive the chip/dot/pill color from these two enums; never
hard-code per-component.

```ts
const SECTION_COLOR: Record<AgendaSection, string> = {
  Update:      'var(--teal)',
  OldBusiness: 'var(--amber)',
  NewBusiness: 'var(--rose)',
  Tabled:      'var(--ink-3)',
};

// Closed stays neutral on purpose — finished is not the same as good.
const STATUS_PILL: Record<ItemStatus, { bg: string; fg: string }> = {
  Open:     { bg: 'var(--teal-soft)',  fg: 'var(--teal)'  },
  Tabled:   { bg: 'var(--amber-soft)', fg: 'var(--amber)' },
  Closed:   { bg: 'var(--surface-2)',  fg: 'var(--ink-3)' },
  Declined: { bg: 'var(--rose-soft)',  fg: 'var(--rose)'  },
};
```

---

## 5. Copy rules

- Dates on phone: `Mon DD` (e.g. "Apr 21"). Long-form only on detail
  pages and headers.
- Currency: `$` + grouped thousands, no decimals unless ≥ $0.01 matters.
- Section labels are always plural ("Updates"), counts are bare numbers
  next to them (no "items").
- Tags render as their raw type-name except `SafetySanctuary` →
  `Safety / Sanctuary` and `FacilityUse` → `Facility use` if rendered
  outside a pill. Inside a pill keep them as one word.
- "Old business" / "New business" / "Tabled" use sentence case. "Action
  items" use sentence case.
- Empty states use a single italic gray line, never an illustration.

---

## 6. Iconography

Use **Lucide** (already MIT-licensed, tree-shakable React). Map:

| Use                | Icon        |
|--------------------|-------------|
| Tab: Agenda        | `ListChecks`|
| Tab: Items         | `Layers`    |
| Tab: Actions       | `CheckSquare` |
| Tab: People        | `Users`     |
| Section: Updates   | `Activity`  |
| Section: Old       | `History`   |
| Section: New       | `Sparkles`  |
| Section: Tabled    | `Pause`     |
| Urgent flag        | `AlertCircle` |
| Dispute flag       | `AlertTriangle` |
| Money              | `DollarSign`|
| Add update         | `Plus`      |
| Vendor             | `Building2` |

Stroke width 1.75. Phone icons 20×20; desktop 16×16 inline, 18×18 in
rail.

---

## 7. Implementation pointers

- All semantic colors and radii live in `:root` in `styles.css` so the
  Microsoft Graph data layer never touches design.
- `MeetingEntry.statusChangeTo` should render as a `→ {status}` pill
  using the `STATUS_PILL` map above.
- Action item completion is a tap on the 22×22 checkbox; long-press
  opens a sheet to add a `completedNote`.
- The agenda generator output is consumed unchanged — the design only
  styles the four sections it returns. Tabled items render at 78%
  opacity but otherwise identical to active ones.
- Tag overflow rule: cap visible tag pills at 3 per row; show `+N` chip
  with the same shape as the others.
