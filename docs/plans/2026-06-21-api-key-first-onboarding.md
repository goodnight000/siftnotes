# API-Key-First Onboarding Implementation Plan

**Goal:** Make SiftNotes first-run setup collect user-owned API keys for transcription and summaries, then continue directly to permissions.

**Architecture:** Reuse the existing provider settings commands. The API-key onboarding screen saves summary provider settings and transcript provider settings, then completes onboarding through a backend command that only marks onboarding complete. Cloud transcription uses the existing transcription provider trait so the recorder does not require Parakeet or local Whisper for Groq/OpenAI configs.

**Tech Stack:** Tauri v2, React, TypeScript, Rust, SQLite settings repository.

## Task 1: Backend Completion Command

Files:
- Modify: `frontend/src-tauri/src/onboarding.rs`

Steps:
1. Update the existing completion test so API-key onboarding finishes on step 3.
2. Update `mark_api_key_onboarding_status_complete` to set `completed = true` and `current_step = 3`.
3. Verify with `cargo test --lib api_key_onboarding`.

## Task 2: Cloud Transcription Adapter

Files:
- Add: `frontend/src-tauri/src/audio/transcription/cloud_provider.rs`
- Modify: `frontend/src-tauri/src/audio/transcription/mod.rs`
- Modify: `frontend/src-tauri/src/audio/transcription/engine.rs`
- Modify: `frontend/src-tauri/src/audio/recording_commands.rs`

Steps:
1. Add tests that recognize Groq/OpenAI cloud transcription providers and reject missing API keys.
2. Add a provider implementation that sends 16 kHz mono WAV chunks to OpenAI-compatible transcription endpoints.
3. Route Groq/OpenAI transcript configs to `TranscriptionEngine::Provider`.
4. Skip local model unload during shutdown for cloud transcription sessions.

## Task 3: API-Key Setup Screen

Files:
- Modify: `frontend/src/components/onboarding/steps/ApiKeySetupStep.tsx`
- Modify: `frontend/src/components/onboarding/steps/WelcomeStep.tsx`

Steps:
1. Add summary provider fields.
2. Add transcription provider fields with Groq and OpenAI defaults.
3. Save transcript config with the selected provider, model, and API key.
4. Remove the local-model fallback and skip actions from onboarding.

## Task 4: Flow Routing

Files:
- Modify: `frontend/src/components/onboarding/OnboardingFlow.tsx`
- Modify: `frontend/src/components/onboarding/steps/PermissionsStep.tsx`
- Modify: `frontend/src/contexts/OnboardingContext.tsx`

Steps:
1. Route step 3 to permissions on macOS.
2. Auto-complete on non-macOS at step 3.
3. Clamp saved onboarding steps to 3.

## Task 5: Verification and Install

Run:
```bash
cargo test --lib cloud_transcription
cargo test --lib api_key_onboarding
pnpm build
PATH=/Users/charleszheng/.cargo/bin:$PATH pnpm tauri build
```

Copy the final `.app` into `/Applications/SiftNotes.app` and remove duplicate Desktop/build bundle copies.
