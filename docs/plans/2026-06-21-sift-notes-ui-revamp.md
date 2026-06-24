# SiftNotes UI Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Re-skin the SiftNotes desktop app into the Sift "cool + clay" design language (warm-neutral surfaces, clay accent, Space Grotesk / Avio Sans / Commit Mono), fix the overflowing meeting header, and add a new "All notes" browse page — all by changing tokens, layout, and fonts while reusing existing components.

**Architecture:** A token-first re-skin. We redefine the existing shadcn CSS variables (in `globals.css`) to the new palette so every existing Radix/shadcn component re-skins automatically, add a few Sift-specific tokens (clay, wash, ink-2/3) for new layout work, reconcile the two conflicting Tailwind configs into one, and self-host the three fonts. Then we re-skin each surface and add one new page. No framework upgrade (stay on Tailwind v3); no new component library.

**Tech Stack:** Next.js 14 (app router) + Tauri 2 (WKWebView) + Tailwind v3 + Radix/shadcn + lucide-react + Framer Motion. Package manager: **pnpm**. Run with `./clean_run.sh` (full Tauri) or `pnpm run dev` (Next-only, port 3118).

**Design source of truth:** `docs/plans/2026-06-21-sift-notes-ui-revamp-design.md` and the mockup in `design-revamp-mockup/` (open the `screen-*.html` files for the visual target).

**Verification note (this is a visual re-skin):** "tests" here = (a) typecheck passes, (b) the surface renders correctly. Use `pnpm exec tsc --noEmit` for typecheck. For pure styling screens use `pnpm run dev` + browser at http://localhost:3118. For data-backed screens (All notes, meeting details) use `./clean_run.sh` (needs Tauri for `invoke`). Compare against the matching `design-revamp-mockup/*.png`. Also open at least one screen in **Safari** (WebKit) since Tauri renders in WebKit, not Chrome.

---

## Task 0: Branch + self-host fonts

**Files:**
- Create: `frontend/public/fonts/*.woff2`

**Step 1: Create a feature branch**

```bash
cd /Users/charleszheng/Desktop/Ideas/sift-notes
git checkout -b enhance/ui-revamp
```

**Step 2: Copy Avio Sans + Commit Mono woff2 into the app**

These already exist in the sibling repo and the mockup folder.

```bash
mkdir -p frontend/public/fonts
cp design-revamp-mockup/fonts/AvioSans-Regular.woff2 \
   design-revamp-mockup/fonts/AvioSans-Medium.woff2 \
   design-revamp-mockup/fonts/AvioSans-SemiBold.woff2 \
   design-revamp-mockup/fonts/AvioSans-Bold.woff2 \
   design-revamp-mockup/fonts/CommitMono-Regular.woff2 \
   design-revamp-mockup/fonts/CommitMono-Medium.woff2 \
   design-revamp-mockup/fonts/CommitMono-SemiBold.woff2 \
   frontend/public/fonts/
```

**Step 3: Self-host Space Grotesk (500/600/700)**

Download woff2 for Space Grotesk weights 500/600/700 into `frontend/public/fonts/` as
`SpaceGrotesk-Medium.woff2`, `SpaceGrotesk-SemiBold.woff2`, `SpaceGrotesk-Bold.woff2`.
Source: https://fontsource.org/fonts/space-grotesk (download) or the Google Fonts files.
(Self-host so the desktop app works offline. Acceptable v1 fallback if blocked: keep a
`@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700")`
at the top of `globals.css` and skip these three files.)

**Step 4: Verify the files exist**

```bash
ls frontend/public/fonts/
# Expect: AvioSans-*.woff2 (4), CommitMono-*.woff2 (3), SpaceGrotesk-*.woff2 (3)
```

**Step 5: Commit**

```bash
git add frontend/public/fonts
git commit -m "chore: self-host Avio Sans, Commit Mono, Space Grotesk fonts"
```

---

## Task 1: Foundation — palette tokens, fonts, single Tailwind config

This is the highest-leverage task: re-point the shadcn tokens and every existing
component re-skins for free.

**Files:**
- Modify: `frontend/src/app/globals.css:79-134` (the `:root` / `.dark` token blocks) and `:1-3` (font-face + var setup)
- Modify: `frontend/tailwind.config.js`
- Delete: `frontend/tailwind.config.ts`
- Modify: `frontend/src/app/layout.tsx:40-44` (drop Source Sans)

**Step 1: Add @font-face + font/role variables at the top of `globals.css`**

Insert immediately after the `@tailwind utilities;` line (keep the existing `@tailwind` lines):

```css
/* ---- Self-hosted faces ---- */
@font-face { font-family:"Avio Sans"; src:url("/fonts/AvioSans-Regular.woff2") format("woff2"); font-weight:400; font-display:swap; }
@font-face { font-family:"Avio Sans"; src:url("/fonts/AvioSans-Medium.woff2") format("woff2"); font-weight:500; font-display:swap; }
@font-face { font-family:"Avio Sans"; src:url("/fonts/AvioSans-SemiBold.woff2") format("woff2"); font-weight:600; font-display:swap; }
@font-face { font-family:"Avio Sans"; src:url("/fonts/AvioSans-Bold.woff2") format("woff2"); font-weight:700; font-display:swap; }
@font-face { font-family:"Commit Mono"; src:url("/fonts/CommitMono-Regular.woff2") format("woff2"); font-weight:400; font-display:swap; }
@font-face { font-family:"Commit Mono"; src:url("/fonts/CommitMono-Medium.woff2") format("woff2"); font-weight:500; font-display:swap; }
@font-face { font-family:"Commit Mono"; src:url("/fonts/CommitMono-SemiBold.woff2") format("woff2"); font-weight:600; font-display:swap; }
@font-face { font-family:"Space Grotesk"; src:url("/fonts/SpaceGrotesk-Medium.woff2") format("woff2"); font-weight:500; font-display:swap; }
@font-face { font-family:"Space Grotesk"; src:url("/fonts/SpaceGrotesk-SemiBold.woff2") format("woff2"); font-weight:600; font-display:swap; }
@font-face { font-family:"Space Grotesk"; src:url("/fonts/SpaceGrotesk-Bold.woff2") format("woff2"); font-weight:700; font-display:swap; }
```

**Step 2: Replace the `:root` token values** (lines ~80-106) with the cool/clay palette.
Values are HSL triplets derived from the hex in the design doc. Keep the same variable
names so existing components re-skin. Add the new clay/wash/ink aliases.

```css
  :root {
    --background: 60 11% 98%;        /* paper  #fbfbfa */
    --foreground: 60 4% 10%;         /* ink    #1a1a18 */
    --card: 0 0% 100%;               /* surface #ffffff */
    --card-foreground: 60 4% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 60 4% 10%;
    --primary: 60 4% 10%;            /* ink — primary buttons stay ink */
    --primary-foreground: 60 11% 98%;
    --secondary: 60 7% 94%;          /* sunken #f1f1ef */
    --secondary-foreground: 60 4% 10%;
    --muted: 60 7% 94%;
    --muted-foreground: 47 4% 50%;   /* ink-3 #83817a */
    --accent: 60 7% 94%;             /* shadcn 'accent' = neutral hover (NOT clay) */
    --accent-foreground: 60 4% 10%;
    --destructive: 5 71% 59%;        /* rec/red #e0564b */
    --destructive-foreground: 0 0% 100%;
    --border: 48 8% 88%;             /* #e4e3df */
    --input: 48 8% 88%;
    --ring: 15 79% 34%;              /* clay focus ring */
    --radius: 0.625rem;              /* 10px */
    /* Sift additions */
    --clay: 15 79% 34%;              /* #9a3412 — THE accent, used sparingly */
    --wash: 20 35% 92%;              /* #f1e7e2 — active-nav fill */
    --ink-2: 43 4% 32%;              /* #54524d secondary text */
    --ink-3: 47 4% 50%;              /* #83817a muted text */
    --rec: 5 71% 59%;                /* record indicator */
    /* role fonts */
    --font-display: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-sans: "Avio Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --font-mono: "Commit Mono", ui-monospace, SFMono-Regular, monospace;
  }
```

**Step 3: Replace the `.dark` block** (lines ~108-133) with a cool charcoal starting set
(dark is a follow-up; this just keeps it from breaking):

```css
  .dark {
    --background: 60 3% 9%;
    --foreground: 48 12% 90%;
    --card: 60 3% 12%;
    --card-foreground: 48 12% 90%;
    --popover: 60 3% 12%;
    --popover-foreground: 48 12% 90%;
    --primary: 48 12% 90%;
    --primary-foreground: 60 3% 9%;
    --secondary: 50 4% 16%;
    --secondary-foreground: 48 12% 90%;
    --muted: 50 4% 16%;
    --muted-foreground: 47 5% 58%;
    --accent: 50 4% 16%;
    --accent-foreground: 48 12% 90%;
    --destructive: 5 65% 62%;
    --destructive-foreground: 0 0% 100%;
    --border: 48 5% 20%;
    --input: 48 5% 20%;
    --ring: 22 75% 52%;
    --clay: 22 75% 52%;
    --wash: 20 30% 18%;
    --ink-2: 47 6% 70%;
    --ink-3: 47 5% 55%;
    --rec: 5 65% 62%;
  }
```

**Step 4: Set the base fonts in `globals.css`** — in the `@layer base { body {...} }` block
(line ~142) add `font-family: var(--font-sans);`, and add a headings rule:

```css
  body {
    @apply bg-background text-foreground;
    overflow: hidden;
    height: 100%;
    font-family: var(--font-sans);
  }
  h1, h2, h3, h4 {
    font-family: var(--font-display);
    letter-spacing: -0.02em;
  }
```

**Step 5: Reconcile to a single Tailwind config.** Delete the conflicting `.ts`:

```bash
git rm frontend/tailwind.config.ts
```

Then edit `frontend/tailwind.config.js`: (a) make every `hsl(var(--x))` use the alpha
placeholder so opacity modifiers keep working, (b) add fontFamily roles, (c) carry over the
fontSize scale from the deleted `.ts`, (d) add the clay/wash/ink aliases, (e) add the
typography plugin. Replace the `theme.extend` and `plugins` with:

```js
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['26px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        h2: ['20px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.55' }],
        small: ['13px', { lineHeight: '1.5' }],
        caption: ['12px', { lineHeight: '1.4' }],
      },
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        primary: { DEFAULT: 'hsl(var(--primary) / <alpha-value>)', foreground: 'hsl(var(--primary-foreground) / <alpha-value>)' },
        secondary: { DEFAULT: 'hsl(var(--secondary) / <alpha-value>)', foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)' },
        card: { DEFAULT: 'hsl(var(--card) / <alpha-value>)', foreground: 'hsl(var(--card-foreground) / <alpha-value>)' },
        popover: { DEFAULT: 'hsl(var(--popover) / <alpha-value>)', foreground: 'hsl(var(--popover-foreground) / <alpha-value>)' },
        muted: { DEFAULT: 'hsl(var(--muted) / <alpha-value>)', foreground: 'hsl(var(--muted-foreground) / <alpha-value>)' },
        accent: { DEFAULT: 'hsl(var(--accent) / <alpha-value>)', foreground: 'hsl(var(--accent-foreground) / <alpha-value>)' },
        destructive: { DEFAULT: 'hsl(var(--destructive) / <alpha-value>)', foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)' },
        // Sift aliases for new layout work
        paper: 'hsl(var(--background) / <alpha-value>)',
        surface: 'hsl(var(--card) / <alpha-value>)',
        sunken: 'hsl(var(--secondary) / <alpha-value>)',
        ink: 'hsl(var(--foreground) / <alpha-value>)',
        'ink-2': 'hsl(var(--ink-2) / <alpha-value>)',
        'ink-3': 'hsl(var(--ink-3) / <alpha-value>)',
        clay: 'hsl(var(--clay) / <alpha-value>)',
        wash: 'hsl(var(--wash) / <alpha-value>)',
        rec: 'hsl(var(--rec) / <alpha-value>)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate'), require('@tailwindcss/typography')],
```

**Step 6: Drop Source Sans from `layout.tsx`.** Remove the `Source_Sans_3` import
(line 4) and the `sourceSans3` const (lines 40-44), and remove `sourceSans3.variable` from
wherever it is applied to the body/html className (search for `sourceSans3`). The fonts now
come from `globals.css`.

**Step 7: Typecheck**

```bash
cd frontend && pnpm exec tsc --noEmit
# Expected: no errors (or only pre-existing unrelated ones)
```

**Step 8: Visual verify**

```bash
cd frontend && pnpm run dev
# Open http://localhost:3118 — body text should be Avio Sans, the welcome
# heading Space Grotesk, the background cool near-white (#fbfbfa).
```

**Step 9: Commit**

```bash
git add frontend/src/app/globals.css frontend/tailwind.config.js frontend/src/app/layout.tsx
git commit -m "feat(ui): adopt Sift cool/clay tokens + fonts, unify tailwind config"
```

---

## Task 2: Re-skin the rail + add the "Notes" nav item

**Files:**
- Modify: `frontend/src/components/Sidebar/index.tsx:4` (icon import), `:523-582` (`renderCollapsedIcons`), and the expanded meeting-list markup.

**Step 1: Add the grid icon to the lucide import** (line 4): add `LayoutGrid` to the existing import list.

**Step 2: Add a "Notes" rail item** inside `renderCollapsedIcons()` (after the Home item,
before Import). Mirror the existing Home item pattern, using token classes instead of gray:

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <button
      onClick={() => router.push('/notes')}
      className={`p-2 rounded-lg transition-colors duration-150 ${
        pathname.startsWith('/notes') ? 'bg-wash text-clay' : 'text-ink-3 hover:bg-sunken'
      }`}
    >
      <LayoutGrid className="w-5 h-5" />
    </button>
  </TooltipTrigger>
  <TooltipContent side="right"><p>All notes</p></TooltipContent>
</Tooltip>
```

(If `pathname` isn't in scope in this function, derive it from the existing `usePathname()`
already imported at line 5.)

**Step 3: Re-skin the other rail items** (Home, Import, Settings) in the same function:
replace `bg-gray-100` → `bg-wash text-clay` for active, `hover:bg-gray-100` → `hover:bg-sunken`,
`text-gray-600` → `text-ink-3`. Keep sizes/structure identical.

**Step 4: Re-skin the expanded sidebar** meeting-list markup: replace gray utilities with
tokens — container `bg-paper`, hairlines `border-border`, hover rows `hover:bg-sunken`,
active row `bg-surface border border-border`, titles `text-ink`, dates `text-ink-3`. Do NOT
change structure or behavior. (Search the file for `gray-` and `bg-white` and convert.)

**Step 5: Typecheck + visual verify**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm run dev
# The rail icons should be ink-gray with a clay wash on the active item;
# a new grid icon ("All notes") appears under Home. Compare to design-revamp-mockup/screen-home.png
```

**Step 6: Commit**

```bash
git add frontend/src/components/Sidebar/index.tsx
git commit -m "feat(ui): re-skin rail to clay tokens, add All notes nav item"
```

---

## Task 3: New "All notes" page (dense list)

**Files:**
- Create: `frontend/src/app/notes/page.tsx`

Target: `design-revamp-mockup/screen-notes-list.png`. Reuse `useSidebar().meetings`
(`CurrentMeeting[]` — fields `id`, `title`, `created_at`). No snippet/duration is available
cheaply from `api_get_meetings`, so v1 shows **title + relative date**; a snippet column is a
documented follow-up (needs a batch metadata endpoint).

**Step 1: Create the page**

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ChevronDown } from 'lucide-react';
import { useSidebar } from '@/components/Sidebar/SidebarProvider';

function fmtDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Mirror the sidebar's routing rule (Sidebar/index.tsx:619-621).
function hrefFor(id: string) {
  if (id.startsWith('intro-call')) return '/';
  return id.includes('-') ? `/meeting-details?id=${id}` : `/notes/${id}`;
}

export default function AllNotesPage() {
  const router = useRouter();
  const { meetings } = useSidebar();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...meetings]
      .filter((m) => !m.is_archived)
      .filter((m) => !q || m.title?.toLowerCase().includes(q))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [meetings, query]);

  return (
    <div className="flex h-full flex-col bg-paper">
      <header className="flex items-end justify-between gap-5 px-8 pt-6 pb-4">
        <div>
          <h1 className="text-h1 text-ink">All notes</h1>
          <div className="mt-1 text-caption text-ink-3">{rows.length} notes</div>
        </div>
        <div className="flex items-center gap-2.5 no-drag">
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2">
            <Search className="h-4 w-4 text-ink-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="w-44 bg-transparent text-small text-ink outline-none placeholder:text-ink-3"
            />
          </div>
          <button className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-small text-ink-2">
            Recent <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="custom-scrollbar flex-1 overflow-auto px-8 pb-8">
        {rows.length === 0 ? (
          <div className="grid h-40 place-items-center text-ink-3">No notes yet.</div>
        ) : (
          rows.map((m) => (
            <button
              key={m.id}
              onClick={() => router.push(hrefFor(m.id))}
              className="flex w-full items-center gap-5 border-b border-border px-2.5 py-3.5 text-left transition-colors hover:bg-sunken"
            >
              <span className="w-60 flex-none truncate text-small font-semibold text-ink">
                {m.title || 'Untitled meeting'}
              </span>
              <span className="flex-1 truncate text-small text-ink-2">
                {m.project || ''}
              </span>
              <span className="w-28 flex-none text-right text-caption text-ink-3">
                {fmtDate(m.created_at)}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

**Step 2: Confirm `useSidebar()` is available on this route.** `SidebarProvider` wraps the
app in `layout.tsx`, so the hook works here. If TypeScript complains that `meetings` isn't on
the context type, check `SidebarProvider.tsx` exports `meetings` (it does, per the context
value) and import the `CurrentMeeting` type if needed.

**Step 3: Typecheck**

```bash
cd frontend && pnpm exec tsc --noEmit
```

**Step 4: Visual verify with real data (needs Tauri)**

```bash
cd /Users/charleszheng/Desktop/Ideas/sift-notes && ./clean_run.sh
# Click the new grid icon in the rail → /notes. You should see a dense list of your
# real meetings (title + date), searchable. Clicking a row opens that meeting.
# Compare to design-revamp-mockup/screen-notes-list.png
```

**Step 5: Commit**

```bash
git add frontend/src/app/notes/page.tsx
git commit -m "feat(ui): add All notes dense-list page"
```

---

## Task 4: Re-skin home / recording

**Files:**
- Modify: `frontend/src/app/page.tsx:197` (`bg-gray-50`) and the pill wrapper (226-254)
- Modify: `frontend/src/app/_components/TranscriptPanel.tsx` (welcome empty state + transcript lines)
- Modify: `frontend/src/components/RecordingControls.tsx` (the pill)

Targets: `design-revamp-mockup/screen-home.png` and `screen-recording.png`.

**Step 1:** In `page.tsx`, change the page wrapper `bg-gray-50` → `bg-paper` (both the home
`motion.div` and any other `bg-gray-50`). Leave the layout/structure intact.

**Step 2:** In `_components/TranscriptPanel.tsx`, re-skin the empty/welcome state: heading
uses `font-display text-3xl text-ink` ("Welcome to SiftNotes"), subtitle `text-ink-3`. For
transcript lines: timestamp `font-mono text-caption text-ink-3`, text `text-ink` with
comfortable `leading-relaxed`. Replace any `text-gray-*`/`bg-gray-*` with tokens. Keep the
virtualized list and confidence logic; only change classes.

**Step 3:** In `RecordingControls.tsx`, re-skin the pill: container
`bg-surface border border-border rounded-full shadow-[0_4px_16px_-4px_rgba(28,25,22,0.18)]`;
the record button stays red (`bg-rec`); when recording show a `font-mono text-ink` timer and
a stop **square**; the `⋯` menu trigger is `text-ink-3`. Keep all handlers/props unchanged.

**Step 4: Typecheck + verify**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm run dev
# Home: clean warm welcome + re-skinned pill. Start a recording (needs ./clean_run.sh
# for real audio) to verify the recording pill + live transcript styling.
```

**Step 5: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/_components/TranscriptPanel.tsx frontend/src/components/RecordingControls.tsx
git commit -m "feat(ui): re-skin home + recording surface"
```

---

## Task 5: Meeting view — re-skin + fix the overflowing header

**Files:**
- Modify: `frontend/src/components/MeetingDetails/SummaryPanel.tsx` (header → primary + Save + overflow menu)
- Modify: `frontend/src/components/MeetingDetails/TranscriptPanel.tsx` (re-skin)
- Modify: `frontend/src/app/meeting-details/page-content.tsx:213` (`bg-gray-50` → `bg-paper`)

Target: `design-revamp-mockup/screen-meeting.png`. **This is the headline fix** — the ~10
crammed buttons that overflow and clip "Export" become **`Regenerate summary` (ink) + `Save`
(ghost) + a `⋯` overflow menu**.

**Step 1: Build the overflow menu using the existing dropdown component.** Import the app's
`DropdownMenu` primitives from `@/components/ui/dropdown-menu` (already used elsewhere).
Replace the current multi-button header rows in `SummaryPanel.tsx` with one header:

```tsx
<header className="no-drag flex items-center justify-between gap-6 border-b border-border px-6 py-4">
  <div className="min-w-0">
    <EditableTitle /* keep existing title component/props */ className="font-display text-h2 text-ink" />
    <div className="mt-1 truncate text-caption text-ink-3">
      {/* date · duration · speakers, from existing meeting fields */}
    </div>
  </div>
  <div className="flex flex-none items-center gap-2">
    <Button onClick={onGenerateSummary} className="bg-primary text-primary-foreground">
      {/* Sparkles icon */} Regenerate summary
    </Button>
    <Button variant="ghost" onClick={onSaveAll}>Save</Button>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="More actions">{/* MoreHorizontal */}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onCopySummary}>Copy summary</DropdownMenuItem>
        <DropdownMenuItem onClick={onCopyTranscript}>Copy transcript</DropdownMenuItem>
        <DropdownMenuItem onClick={onExportMarkdown}>Export markdown</DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenFolder}>Open recording folder</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openModelSettings}>AI model</DropdownMenuItem>
        <DropdownMenuItem onClick={openTemplate}>Template</DropdownMenuItem>
        <DropdownMenuItem onClick={openLanguage}>Language</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">Delete meeting</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</header>
```

Wire each item to the handler the old buttons already used (they're all present as props on
`SummaryPanel` per `page-content.tsx:237-273`: `onCopySummary`, `onExportMarkdown`,
`onOpenFolder`, template/model/language openers, etc.). The transcript-side "Copy" /
"Recording" / "Enhance" buttons that lived above the transcript move into this menu (Copy
transcript / Open recording folder) or a single icon button on the transcript column.

**Step 2: Re-skin the transcript column** (`TranscriptPanel.tsx`): a quiet `Transcript` label
(`text-small font-semibold text-ink-2`) + a copy icon button; lines with `font-mono
text-caption text-ink-3` timestamps and `text-ink` body. Keep the "Add context…" textarea,
re-skinned (`bg-surface border border-border rounded-lg text-ink-3`). Convert gray utilities.

**Step 3: Re-skin the summary sections**: section headings `font-display text-h3 text-ink`,
body `text-ink-2`. The BlockNote editor component itself is unchanged.

**Step 4: Verify nothing clips.** Typecheck, then open the meeting view and shrink the window
to ~1000px wide — confirm the header never clips and the overflow menu holds the rest.

```bash
cd frontend && pnpm exec tsc --noEmit
cd /Users/charleszheng/Desktop/Ideas/sift-notes && ./clean_run.sh
# Open any meeting. Header = Regenerate + Save + ⋯ ; resize narrow → no clipping.
```

**Step 5: Commit**

```bash
git add frontend/src/components/MeetingDetails/SummaryPanel.tsx frontend/src/components/MeetingDetails/TranscriptPanel.tsx frontend/src/app/meeting-details/page-content.tsx
git commit -m "feat(ui): re-skin meeting view and fix overflowing header"
```

---

## Task 6: Sweep, WebKit QA, follow-ups

**Step 1: Hunt remaining hardcoded grays/colors.**

```bash
cd frontend && grep -rEn "gray-[0-9]|bg-white|text-black|#[0-9a-fA-F]{6}|hsl\(221" src/ | grep -v node_modules
```

Convert stragglers in visible surfaces to tokens (`bg-surface`, `text-ink`, `border-border`,
etc.). Don't touch logic; classes only. Commit per area.

**Step 2: WebKit check.** Build and open in the real Tauri window (WKWebView):

```bash
cd /Users/charleszheng/Desktop/Ideas/sift-notes && ./clean_run.sh
```

Verify fonts load, colors render, and the overflow menu works. (Also spot-check the mockup
`screen-meeting.html` in **Safari** to confirm `color-mix`/modern CSS behave on WebKit.)

**Step 3: Typecheck the whole app + lint.**

```bash
cd frontend && pnpm exec tsc --noEmit && pnpm run lint
```

**Step 4: Commit and open PR.**

```bash
git add -A && git commit -m "chore(ui): token sweep + WebKit QA fixes"
git push -u origin enhance/ui-revamp
```

**Deferred (separate follow-up PRs, per design doc "out of scope"):**
- Settings + onboarding re-skin.
- Dark-mode pass (token values are seeded in `.dark`; verify/tune contrast, add a toggle).
- Motion retune to Sift durations (80/160/240/400ms).
- All-notes snippet/duration columns (needs a batch metadata endpoint to avoid N calls).
- **Confirm Avio Sans licensing for SiftNotes before public release.**

---

## Sequencing & validation summary

| Task | Surface | Verify against |
| ---- | ------- | -------------- |
| 0 | fonts on disk | `ls frontend/public/fonts` |
| 1 | tokens + fonts + config | body=Avio, headings=Space Grotesk, paper bg |
| 2 | rail + Notes item | `screen-home.png` |
| 3 | All notes page | `screen-notes-list.png` |
| 4 | home / recording | `screen-home.png`, `screen-recording.png` |
| 5 | meeting view + header | `screen-meeting.png` (header never clips) |
| 6 | sweep + QA | grep clean, WebKit render |

Each task ends green (typecheck + visual match) and is committed before the next begins.
