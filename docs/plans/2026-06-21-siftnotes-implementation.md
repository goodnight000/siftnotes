# SiftNotes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a renamed SiftNotes macOS desktop app with Markdown export, custom templates, and automatic decisions/action-items/follow-ups.

**Architecture:** Reuse Meetily's Tauri desktop shell, SQLite repositories, existing summary template system, and provider settings. Add only thin backend commands and UI controls where the existing seams are missing.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tauri v2, Rust, SQLite via sqlx, pnpm, Cargo.

---

### Task 1: Rebrand Desktop App

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src-tauri/tauri.conf.json`
- Modify: `frontend/src-tauri/Info.plist`
- Search/modify user-visible Meetily strings only where they affect the app identity.

**Step 1: Write the failing check**

Run:

```bash
rg -n "meetily|Meetily|meeting-minutes|com\\.meetily\\.ai|Zackriya" frontend/package.json frontend/src-tauri frontend/src README.md
```

Expected: existing branding is present.

**Step 2: Implement minimal rebrand**

- Change product name/title to `SiftNotes`.
- Change package name to `sift-notes`.
- Change bundle identifier to `com.siftnotes.desktop`.
- Disable upstream updater endpoints for this personal build.
- Keep MIT license notices.

**Step 3: Verify**

Run:

```bash
rg -n "meeting-minutes|com\\.meetily\\.ai|Zackriya-Solutions/meeting-minutes" frontend/package.json frontend/src-tauri
```

Expected: no app identity or updater references remain.

### Task 2: Default Summary Template

**Files:**
- Modify: `frontend/src-tauri/templates/standard_meeting.json`
- Test: `frontend/src-tauri/src/summary/templates/types.rs`

**Step 1: Write the failing test**

Add a Rust unit test that loads the standard template and asserts it contains these section titles:

```text
Summary
Decisions
Action Items
Follow-ups
```

Run:

```bash
cd frontend/src-tauri && /Users/charleszheng/.cargo/bin/cargo test summary::templates
```

Expected: FAIL because `Follow-ups` is missing and `Key Decisions` uses the old title.

**Step 2: Implement minimal template change**

Update `standard_meeting.json` so the sections are exactly focused on Summary, Decisions, Action Items, Follow-ups, and optional Discussion Notes.

**Step 3: Verify**

Run the same Cargo test. Expected: PASS.

### Task 3: Markdown Export Backend

**Files:**
- Create: `frontend/src-tauri/src/export/mod.rs`
- Create: `frontend/src-tauri/src/export/markdown.rs`
- Modify: `frontend/src-tauri/src/lib.rs`

**Step 1: Write failing Rust tests**

Test that the Markdown renderer produces:

- H1 title.
- Summary markdown.
- Transcript section.
- Speaker/timestamp lines when available.

Run:

```bash
cd frontend/src-tauri && /Users/charleszheng/.cargo/bin/cargo test export::markdown
```

Expected: FAIL because module does not exist.
