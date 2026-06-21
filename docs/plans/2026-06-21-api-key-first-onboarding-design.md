# API-Key-First Onboarding Design

## Decision

SiftNotes should default onboarding to a bring-your-own-key setup for summaries. The app is meant to be a personal desktop app, so first-run setup should make provider ownership explicit instead of implying that bundled local summary models are required.

Live recording still requires a local transcription engine in the current codebase. The recorder validates only Parakeet and local Whisper before capture, so cloud transcription keys should not be the default onboarding path until a dedicated recording adapter exists.

## Goals

- Default to summary API-key setup first.
- Keep local summary setup available as a fallback.
- Save summary provider choices during onboarding.
- Keep local Parakeet transcription configured for live recording.
- Do not overwrite API-key provider choices when onboarding completes.
- Keep the permissions step because meeting capture still needs macOS permissions.

## Flow

1. Welcome: position SiftNotes as a private desktop app that can use your API key for summaries.
2. API Key: ask for the summary provider. Default summary provider is OpenRouter; xAI is a preset through the existing OpenAI-compatible custom server path.
3. Local transcription: download Parakeet, because live recording currently depends on a local transcription engine.
4. Permissions: request microphone and system audio.

If the user chooses local models instead, step 3 keeps the existing local model setup path and downloads both Parakeet and the local summary model.

## Provider Defaults

Summary:
- OpenRouter: `openai/gpt-4o-mini`
- xAI: endpoint `https://api.x.ai/v1`, model `grok-4.3`
- Custom OpenAI-compatible: user supplies endpoint and model.
- OpenAI: `gpt-4o-mini`
- Claude: `claude-sonnet-4-5-20250929`
- Groq: `llama-3.3-70b-versatile`

Transcription:
- Live recording default: local Parakeet, `parakeet-tdt-0.6b-v3-int8`.
- Cloud transcription providers should be added in a separate adapter slice, because the current recorder rejects non-local providers before recording.

## Completion Behavior

API-key onboarding must mark onboarding complete without replacing the configured summary provider settings. Local-only onboarding may continue to use the existing `complete_onboarding` path that saves built-in AI and Parakeet defaults.

## Testing

- Frontend production build catches React and TypeScript regressions.
- Focused Rust test verifies API-key onboarding completion preserves saved settings.
- Final Tauri build creates `/Applications/SiftNotes.app`.
