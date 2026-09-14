# Lithia Springs identity in Trustee Tracker

The church's identity supplies the visual language; the app's job
supplies the layout. This is a working tool for the Board of Trustees,
so the identity shows up in type, color and wording — not in hero
images or decoration.

Reference: <https://lithiaspringsmethodist.org>.

---

## Type

| Face | Used for |
|---|---|
| **Libre Caslon Text** (`--font-serif`) | Page titles, project titles, help-page headings |
| **National Park** (`--font-sans`) | Everything you work in: body text, controls, labels, inputs, status |
| System monospace (`--font-mono`) | `code`, field names, identifiers |

Fallbacks: `Georgia, 'Times New Roman', serif` and
`system-ui, -apple-system, 'Segoe UI', sans-serif`.

Regular weight is the default. 600 is for hierarchy, emphasis and
primary actions; 700+ is rare. Titles are set in Caslon at 400 — the
face carries the weight on its own.

### Font files

Both families are the church's own, served from this origin at
`/fonts/`, under the **SIL Open Font License 1.1**. The license text
ships beside them:

```
public/fonts/libre-caslon-400.woff2   weight 400
public/fonts/libre-caslon-700.woff2   weight 500–900
public/fonts/np-400.woff2             weight 400
public/fonts/np-600.woff2             weight 500–600
public/fonts/np-700.woff2             weight 700–900
public/fonts/OFL-LibreCaslonText.txt
public/fonts/OFL-NationalPark.txt
```

The `@font-face` weight ranges above are declared exactly as the church
site declares them, so a weight never gets synthesised.

**The printed packet is not restyled.** `src/agenda/pdf.ts` stays on
Helvetica, which every PDF reader has built in. Exports keep their own
typography.

---

## Color

Defined once in `:root` in `src/styles.css`. Nothing hard-codes a hex
per component; `src/design/tokens.ts` maps sections and statuses onto
these names.

| Token | Value | Role |
|---|---|---|
| `--green` | `#0b3f3c` | Identity only — the wordmark, the app chrome |
| `--teal` | `#007672` | Selected context, standing/healthy state |
| `--teal-soft` | `#e0efee` | Selected surface |
| `--teal-line` | `#b3d8d5` | Border on a selected surface |
| `--blue` | `#006db6` | The one primary action; links |
| `--blue-deep` | `#005a97` | Primary action, hover |
| `--ink` | `#1a1c1a` | Main text |
| `--ink-2` | `#57534c` | Secondary text |
| `--ink-3` | `#6b665e` | Meta and tertiary text |
| `--bg` | `#faf9f6` | Warm white page |
| `--surface` | `#ffffff` | Cards |
| `--surface-2` | `#f4f2ed` | Inset panels |
| `--hairline` | `#eeeae4` | Warm separator |
| `--hairline-2` | `#ddd8cf` | Stronger border |
| `--amber` / `--amber-soft` | `#8a5a24` / `#f6ecdd` | Old business, money caution, unfinished saves |
| `--rose` / `--rose-soft` | `#a03c3c` / `#f6e3e1` | New business, errors, destructive actions |

Deep green is for identity, teal for selected context, blue for the
primary action. Backgrounds stay quiet.

**What is deliberately not green.** Status colors carry meaning, not
mood: `Closed` is neutral gray, because finished is not the same as
good. Tag colors are a categorical palette and ownership (avatar)
colors are a stable per-name hash — both keep their hues.

**Contrast.** Every text color clears 4.5:1 on the surface it sits on,
including the tag pills at 10% tint and white on the teal, blue and
avatar fills. Two inherited colors were darkened to get there:
amber `#b87333 → #8a5a24` and the amber avatar fill.

**States.** `:focus-visible` is a 2px blue outline with 2px offset,
applied globally. Text inputs additionally take a teal border and a
pale teal ring while focused. `:disabled` is 50% opacity with the
not-allowed cursor. Hover on a quiet control is `--surface-2`.

---

## Shape and density

Controls take `--radius-control` (6px); cards take `--radius-card`
(12px); rows `--radius-row` (10px); status and tag pills stay pills.
Thin borders and a slightly different surface do the separating —
no shadows on working screens, no glass panels, no pulsing indicators.

One visually dominant action per screen. On a project page that is
"Add an update"; the per-card buttons beside it are quiet.

---

## Voice

For the working screens:

- Name the action: *Save update*, *Finish saving*, *Print agenda*.
- Say what happened to the record, then what to do about it. The three
  save outcomes are worded so a secretary can tell them apart without
  knowing anything about HTTP: *Not saved* / *Saved — one step left* /
  *Not sure this was saved*.
- Prefer a plain date to an internal title: "the September 15 meeting",
  not "2026-09-15 Regular".
- Keep the board's own words. Projects are projects, updates are
  updates, the sections are Updates / Old business / New business /
  Tabled, exactly as the chair's agenda has always read.
- Contextual help sits next to the decision it affects, and nowhere
  else.

The church's public voice — "Founded in 1885. Still here, still
gathering." — belongs on the church's own pages, not sprinkled through
a board tool. What carries over is the plainness and the specificity.

---

## Identity assets

`public/brand/lsmc-logo-ink.svg` and `lsmc-logo-cream.svg` are the
church's wordmark, taken from the church site unmodified. The ink
version appears once in the desktop header and once on the sign-in
screen. It identifies whose tool this is; it never competes with the
work on the page. Do not recolor, redraw or substitute it.
