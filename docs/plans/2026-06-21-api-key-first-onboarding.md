# API-Key-First Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make SiftNotes first-run setup default to user-owned summary API keys while preserving the local transcription requirement that live recording currently depends on.

**Architecture:** Add an onboarding setup mode to the React onboarding context. API-key mode saves summary provider settings directly and completes onboarding through a new backend command that only marks onboarding complete. Local mode keeps the existing local model completion logic.

**Tech Stack:** Tauri v2, React, TypeScript, Rust, SQLite settings repository.

---

### Task 1: Backend Completion Command

**Files:**
- Modify: `frontend/src-tauri/src/onboarding.rs`
- Modify: `frontend/src-tauri/src/lib.rs`

**Step 1: Write the failing test**

Add a unit-style test for a helper that updates `OnboardingStatus` to completed without changing model provider config.

**Step 2: Implement helper and command**

Add:
- `mark_api_key_onboarding_status_complete(status: &mut OnboardingStatus)`
- `complete_api_key_onboarding(app: AppHandle<R>)`

The command loads the onboarding store, marks it complete, and saves it. It does not call `SettingsRepository::save_model_config` or `save_transcript_config`.

**Step 3: Register command**

Add `onboarding::complete_api_key_onboarding` to the Tauri invoke handler.

**Step 4: Verify**

Run:
```bash
cargo test --lib api_key_onboarding
```

### Task 2: React Setup Mode

**Files:**
- Modify: `frontend/src/contexts/OnboardingContext.tsx`
- Modify: `frontend/src/components/onboarding/OnboardingFlow.tsx`
- Modify: `frontend/src/components/onboarding/steps/index.ts`

**Step 1: Add state**

Add `setupMode: 'api' | 'local'`, defaulting to `'api'`, and expose `setSetupMode`.

**Step 2: Completion routing**

Change `completeOnboarding` so:
- API mode calls `complete_api_key_onboarding`.
- Local mode uses the existing local model completion logic.

**Step 3: Flow routing**

Step 2 renders the new API-key setup step. Step 3 always prepares local transcription; in local mode it also prepares the local summary model. Step 4 renders permissions on macOS or completes on non-macOS.

### Task 3: API-Key Setup Screen

**Files:**
- Create: `frontend/src/components/onboarding/steps/ApiKeySetupStep.tsx`
- Modify: `frontend/src/components/onboarding/steps/WelcomeStep.tsx`
- Modify: `frontend/src/components/onboarding/steps/DownloadProgressStep.tsx`

**Step 1: Build the form**

Inputs:
- Summary provider: OpenRouter, xAI, Custom OpenAI, OpenAI, Claude, Groq.
- Summary model/API key/endpoint where needed.

The screen also makes the local transcription requirement explicit because live recording currently accepts only Parakeet or local Whisper.

**Step 2: Save**

Use existing commands:
- `api_save_model_config`
- `api_save_custom_openai_config`
- `api_save_transcript_config` for the local Parakeet recording default.

**Step 3: Local fallback**

The local fallback button sets `setupMode` to `local` and advances to the existing download step.

### Task 4: Verification and Install

Run:
```bash
pnpm build
PATH=/Users/charleszheng/.cargo/bin:$PATH pnpm tauri build
```

Copy the final `.app` into `/Applications/SiftNotes.app` and remove duplicate Desktop/build bundle copies.
