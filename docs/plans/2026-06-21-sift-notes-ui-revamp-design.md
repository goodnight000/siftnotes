# SiftNotes UI Revamp — Design

Date: 2026-06-21
Status: approved (brainstorming complete; ready for implementation plan)
Mockup: `design-revamp-mockup/` (open the `screen-*.html` files; PNG renders alongside)

## Goal

Re-skin the SiftNotes desktop app (Tauri + Next.js) so it reads as a member of the
**Sift product family**, while preserving the app's current simplicity. This is a
**re-skin, not a re-architecture**: reuse the existing components (Radix/shadcn,
BlockNote, Framer Motion). The redesign lives in three levers only:

> **Layout · Color · Fonts.**

Plus one net-new surface (an All-notes page) and one concrete bug fix (the meeting
header that overflows and clips its buttons).

## Principles (carried from Sift v3 DESIGN.md)

1. **Simplicity first.** The current app is calm and easy to understand. Remove
   clutter; do not add elements. No confidence pips, no citation tokens, no busy
   metadata rows — these were explicitly rejected during brainstorming.
2. **Every element justifies itself.** Minimal decoration; typography, neutral
   surfaces, hairlines, and one accent do the work. Flat elevation.
3. **Reuse, don't rebuild.** Keep existing components and motion; change their
   skin (tokens) and arrangement (layout) only.

## Decision: keep what works

- **Shell / sidebar:** the current slim icon rail + collapsible meeting-list
  sidebar is good — **keep it**. Re-skin only.
- **Meeting view layout:** the current two-column transcript + summary is good —
  **keep it**. Re-skin + fix the header.
- **Home / record pill:** keep the bottom-center record pill pattern.
- **Motion:** keep Framer Motion; optionally retune to Sift's calm durations
  (80 / 160 / 240 / 400ms) but no new motion work is required.

## Color & type (chosen direction: "cool + clay")

Ported as **CSS variables + a Tailwind v3 theme extension** — NOT a Tailwind v4
upgrade (avoid a risky framework migration; same look without it).

### Tokens (light)

| Token       | Value     | Use                                   |
| ----------- | --------- | ------------------------------------- |
| `--paper`   | `#fbfbfa` | app background (cool near-white)      |
| `--surface` | `#ffffff` | cards, raised surfaces                |
| `--sunken`  | `#f1f1ef` | rail, inset fields, hovers            |
| `--border`  | `#e4e3df` | hairlines, dividers                   |
| `--ink`     | `#1a1a18` | primary text, primary buttons         |
| `--ink-2`   | `#54524d` | secondary text                        |
| `--ink-3`   | `#83817a` | muted text, captions                  |
| `--accent`  | `#9a3412` | clay accent — used **sparingly**      |
| `--wash`    | `#f1e7e2` | soft accent fill (active nav)         |
| `--rec`     | `#e0564b` | record indicator (red)                |

- **Dark mode** comes free via a token swap (warm/cool charcoal, accent lifted).
  Lower priority; ship after light is solid.
- **Accent usage is restrained:** clay appears on the active nav wash and a few
  meaning-carrying spots (e.g. destructive "Delete"). **Primary actions stay ink**,
  so clay stays special. (We compared an amber-forward variant and rejected it.)

### Fonts

| Role      | Font          | Notes                                            |
| --------- | ------------- | ------------------------------------------------ |
| Display   | Space Grotesk | headings, page titles, welcome (Google/OFL)      |
| Body / UI | **Avio Sans** | all body, labels, controls (chosen over Inter)   |
| Data      | Commit Mono   | timestamps, durations, IDs                       |

- Self-host woff2 (copy from `sift-v3/apps/app/public/fonts/` into
  `frontend/public/fonts/`). **Avio Sans is commercial — confirm the license
  covers SiftNotes before shipping** (action item).
- Space Grotesk + Commit Mono are open; no licensing concern.

## Surfaces

### 1. Home / recording (re-skin)
- Empty state: centered "Welcome to SiftNotes" (Space Grotesk) + subtitle, warm
  whitespace. Mirrors current; only the skin changes.
- Recording: live transcript flows in a clean reading column with quiet `00:01`
  mono timestamps; the bottom pill gains a record dot, mono timer, and stop
  square. No status strip / waveform / device chips clutter.

### 2. Meeting view (re-skin + header fix) — the key fix
- Keep the two-column **transcript (left) + summary (right)** layout.
- **Header (the bug):** the ~10 crammed buttons that currently overflow and clip
  "Export" collapse to a single calm row that never clips:
  - Left: editable **title** (Space Grotesk) + `date · duration` sub.
  - Right: **`Regenerate summary`** (ink primary) · **`Save`** (ghost) · **`⋯`**.
  - The `⋯` overflow holds everything secondary: Copy summary, Copy transcript,
    Export markdown, Open recording folder, AI model, Template, Language, Delete.
- Transcript column: quiet "Transcript" label + a copy icon; lines = mono
  timestamp + text. Keeps the "Add context for AI summary…" box at its base.
- Summary column: BlockNote editor (unchanged component) with section headings in
  Space Grotesk.

### 3. All notes (NEW page + rail item)
- New rail item **"Notes"** (grid icon) → dedicated full-page browse surface,
  distinct from the quick-switch sidebar.
- **Dense list layout** (chosen over card grid): one row per note =
  **title · summary snippet · `date · duration`**, hairline-separated.
- Page header: "All notes" + count, a search field, and a "Recent ▾" sort.
- Route: `frontend/src/app/notes/page.tsx` (index alongside existing
  `notes/[id]`). Rows link to `meeting-details`.

## Implementation map (files)

- **Tokens/fonts:** `frontend/src/app/globals.css` (CSS vars, `@font-face`),
  reconcile the two Tailwind configs into one and extend with the tokens,
  `frontend/public/fonts/` (add woff2), `frontend/src/app/layout.tsx` (font wiring).
- **Shell/rail/sidebar:** `frontend/src/components/Sidebar/` (re-skin; add the
  "Notes" nav item), rail icons.
- **Home/recording:** `frontend/src/app/page.tsx`,
  `frontend/src/app/_components/TranscriptPanel.tsx`,
  `frontend/src/components/RecordingControls.tsx`.
- **Meeting view:** `frontend/src/app/meeting-details/page-content.tsx`,
  `frontend/src/components/MeetingDetails/SummaryPanel.tsx` (header fix +
  overflow menu via existing dropdown-menu component),
  `frontend/src/components/MeetingDetails/TranscriptPanel.tsx`.
- **All-notes page (new):** `frontend/src/app/notes/page.tsx`.
- **Components:** `frontend/src/components/ui/*` — keep; verify variants resolve to
  the new tokens (button primary = ink, etc.).

## Constraints / notes

- **WebKit (Tauri/WKWebView):** the app renders in WebKit, not Blink. `color-mix()`
  and modern CSS need macOS Safari 16.2+ (fine for current macOS). Preview in
  Safari during QA, not just Chrome.
- **No framework upgrade:** stay on Tailwind v3; tokens via CSS vars + theme extend.
- **Out of scope (this pass):** settings re-skin, onboarding re-skin, and dark mode
  are follow-ups after the core surfaces land.

## Open action items
- Confirm Avio Sans licensing for SiftNotes (commercial font).
- Decide dark-mode timing (token swap is cheap; sequence after light).
