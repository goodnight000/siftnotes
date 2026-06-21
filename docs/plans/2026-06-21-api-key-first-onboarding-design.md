# API-Key-First Onboarding Design

## Decision

SiftNotes first-run setup should collect user-owned API keys for both transcription and summaries. The app is meant to be a personal desktop app, so setup should make provider ownership explicit instead of implying that bundled local models are required.

## Goals

- Default to API-key setup for transcription and summaries.
- Save summary provider choices during onboarding.
- Save transcription provider choices during onboarding.
- Skip local model downloads during API-key onboarding.
- Do not overwrite API-key provider choices when onboarding completes.
- Keep the permissions step because meeting capture still needs macOS permissions.

## Flow

1. Welcome: position SiftNotes as a desktop meeting-notes app that uses the user's providers.
2. API Keys: ask for the summary provider and transcription provider. Default summary provider is OpenRouter; xAI is a preset through the existing OpenAI-compatible custom server path. Default transcription provider is Groq.
3. Permissions: request microphone and system audio on macOS.

Local Parakeet and local Whisper can remain available from settings, but they are not part of first-run API-key onboarding.

## Provider Defaults

Summary:
- OpenRouter: `openai/gpt-4o-mini`
- xAI: endpoint `https://api.x.ai/v1`, model `grok-4.3`
- Custom OpenAI-compatible: user supplies endpoint and model.
- OpenAI: `gpt-4o-mini`
- Claude: `claude-sonnet-4-5-20250929`
- Groq: `llama-3.3-70b-versatile`

Transcription:
- Groq: `whisper-large-v3-turbo`
- OpenAI: `gpt-4o-mini-transcribe`

## Completion Behavior

API-key onboarding marks onboarding complete without replacing the configured summary or transcription provider settings. Completed API-key onboarding stores step 3 because the local download step no longer exists.

## Testing

- Focused Rust tests verify API-key onboarding completion preserves model status and finishes on step 3.
- Focused Rust tests verify Groq and OpenAI are recognized as cloud transcription providers and require API keys.
- Frontend production build catches React and TypeScript regressions.
- Final Tauri build creates `/Applications/SiftNotes.app`.
