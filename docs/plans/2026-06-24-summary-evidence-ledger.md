# Summary Evidence Ledger Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve generated meeting summaries by extracting a structured, timestamped evidence ledger before rendering final Markdown.

**Architecture:** Keep the existing Tauri summary pipeline, but insert an evidence-ledger stage before final report generation. The ledger classifies transcript facts as final decisions, proposals, conditional actions, deferred/private follow-ups, risks, disagreements, and superseded claims so the final summary does not flatten conflicts.

**Tech Stack:** Rust, Tauri, serde/serde_json, existing `summary::llm_client::generate_summary`, existing Markdown templates.

---

### Task 1: Evidence Ledger Model And Renderer

**Files:**
- Create: `frontend/src-tauri/src/summary/evidence.rs`
- Modify: `frontend/src-tauri/src/summary/mod.rs`

**Steps:**
1. Write failing tests for rendering a ledger where an early proposal is superseded by a later final decision.
2. Add serde structs for evidence items, status labels, source references, and ledger root.
3. Add deterministic Markdown rendering helpers for Summary, Timeline, Decisions, Action Items, Follow-ups, Risks, Disagreements, Discussion Notes.
4. Ensure proposal/deferred/superseded items do not appear as final decisions.

### Task 2: JSON Extraction Prompt And Parsing

**Files:**
- Modify: `frontend/src-tauri/src/summary/evidence.rs`

**Steps:**
1. Write failing tests for parsing raw JSON, fenced JSON, and tagged `<evidence_json>` responses.
2. Add an extraction system prompt and user prompt that define the ledger schema and conflict-resolution statuses.
3. Add parser and fallback validation that returns useful errors without panicking.

### Task 3: Wire Evidence Stage Into Processor

**Files:**
- Modify: `frontend/src-tauri/src/summary/processor.rs`

**Steps:**
1. Write failing tests around the final prompt path proving the evidence stage can render a conflict-aware summary body.
2. Add `generate_evidence_ledger` before the final Markdown writer when no cached English summary is reused.
3. Use the evidence-rendered Markdown as the primary final English draft when extraction succeeds.
4. Fall back to the current final Markdown prompt if extraction or parsing fails.

### Task 4: Verification

**Files:**
- Modify tests in `frontend/src-tauri/src/summary/evidence.rs` and `processor.rs`.

**Steps:**
1. Run focused evidence tests.
2. Run `cargo test -p siftnotes summary::`.
3. Run `git diff --check` for touched files.
