# API-Key-First Onboarding Design

## Decision

SiftNotes should default onboarding to a bring-your-own-key setup. The app is meant to be a personal desktop app, so the first-run flow should make summary and transcription provider ownership explicit instead of implying that bundled local models are the required path.

## Goals

- Default to API-key setup first.
- Keep local-only setup available as a fallback.
- Save summary and transcription provider choices during onboarding.
- Do not overwrite API-key provider choices when onboarding completes.
- Keep the permissions step because meeting capture still needs macOS permissions.

## Flow

1. Welcome: position SiftNotes as a private desktop app that can use either your API keys or local models.
2. API Keys: ask for summary and transcription provider choices. Default summary provider is OpenRouter; xAI is a one-click preset through the existing OpenAI-compatible custom server path. Default transcription provider is Groq because it is the cheapest cloud option already represented in the codebase.
3. Permissions: request microphone and system audio.
4. Optional local setup: if the user chooses local-only, route to the existing model download step before permissions.

## Provider Defaults

Summary:
- OpenRouter: `openai/gpt-4o-mini`
- xAI: endpoint `https://api.x.ai/v1`, model `grok-4.3`
- Custom OpenAI-compatible: user supplies endpoint and model.

Transcription:
- Groq: `whisper-large-v3-turbo`
- OpenAI: `gpt-4o-transcribe`
- Deepgram: `nova-3`
- Local fallback: Parakeet model download.

## Completion Behavior

API-key onboarding must mark onboarding complete without replacing the configured model settings. Local-only onboarding may continue to use the existing `complete_onboarding` path that saves built-in AI and Parakeet defaults.

## Testing

- Frontend production build catches React and TypeScript regressions.
- Focused Rust test verifies API-key onboarding completion preserves saved settings.
- Final Tauri build creates `/Applications/SiftNotes.app`.
