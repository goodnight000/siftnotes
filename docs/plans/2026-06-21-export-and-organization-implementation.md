# Export And Organization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add metadata-rich Markdown export, PDF export generated from the same Markdown, and lightweight persisted meeting organization.

**Architecture:** Extend the existing Tauri/Rust export module so Markdown is the canonical export artifact, with PDF produced from that Markdown. Persist organization fields on the `meetings` table and expose them through existing Tauri API commands so the React sidebar and meeting details can stay in sync with the database.

**Tech Stack:** Tauri 2, Rust, sqlx SQLite migrations, Next.js 14, React 18, existing dialog/toast UI.

---

### Task 1: Metadata-Rich Markdown Export

**Files:**
- Modify: `frontend/src-tauri/src/export/markdown.rs`
- Modify: `frontend/src-tauri/src/export/mod.rs`
- Test: `frontend/src-tauri/src/export/markdown.rs`

**Steps:**
1. Add failing renderer tests for a `## Metadata` section with meeting id, export timestamp, duration, transcript count, provider/model provenance, summary status, app version, and transcript inclusion.
2. Extend export data structs to carry metadata and render only available values.
3. Pull meeting id, summary process timestamps/status, transcript counts, provider settings, and app version into the export command.
4. Keep the existing summary and transcript sections intact.

### Task 2: PDF Export

**Files:**
- Modify: `frontend/src-tauri/src/export/mod.rs`
- Create or modify: `frontend/src-tauri/src/export/pdf.rs`
- Modify: `frontend/src-tauri/src/export/markdown.rs`
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src/app/meeting-details/page-content.tsx`
- Modify: `frontend/src/components/MeetingDetails/SummaryPanel.tsx`
- Modify: `frontend/src/components/MeetingDetails/SummaryUpdaterButtonGroup.tsx`

**Steps:**
1. Add failing Rust tests for Markdown-to-HTML escaping/formatting used by PDF generation.
2. Implement a local PDF writer that consumes the canonical Markdown content without network access.
3. Add a Tauri command `api_export_meeting_pdf` using the same export data builder as Markdown.
4. Add an `Export PDF` UI action beside the existing Markdown export path with save dialog and toast handling.

### Task 3: Meeting Organization

**Files:**
- Add: `frontend/src-tauri/migrations/20260621000000_add_meeting_organization.sql`
- Modify: `frontend/src-tauri/src/database/models.rs`
- Modify: `frontend/src-tauri/src/database/repositories/meeting.rs`
- Modify: `frontend/src-tauri/src/api/api.rs`
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src/components/Sidebar/SidebarProvider.tsx`
- Modify: `frontend/src/components/Sidebar/index.tsx`
- Modify: `frontend/src/app/meeting-details/page.tsx`
- Modify: `frontend/src/app/meeting-details/page-content.tsx`
- Modify: `frontend/src/hooks/meeting-details/useMeetingData.ts`

**Steps:**
1. Add migration columns: `project`, `tags`, `is_pinned`, `is_archived`.
2. Extend Rust models/API DTOs and add update command for organization fields.
3. Update sidebar state to carry full meeting list metadata.
4. Group meetings by project, show pinned first, hide archived by default, and add lightweight archive/pin/project/tag controls.
5. Keep title edit/delete behavior working.

### Task 4: Verification

**Steps:**
1. Run focused Rust export tests.
2. Run `cargo check` and broader relevant Rust tests if build time allows.
3. Run frontend lint/build or the strongest available checks.
4. Start the dev server/app and verify Markdown export, PDF export, and organization controls in-app.
