# SiftNotes Design

## Goal

SiftNotes is a personal, local-first desktop meeting-notes app forked from Meetily Community Edition. It should open by double-clicking a macOS app bundle, record or import meetings, transcribe them, summarize them, and export clean Markdown notes.

## Product Decisions

- App name: SiftNotes.
- Local source repo: `~/Desktop/Ideas/sift-notes`.
- macOS bundle name: `SiftNotes.app`.
- Bundle identifier: `com.siftnotes.desktop`.
- Keep the MIT license notice from Meetily.
- Remove Meetily update endpoints and product branding from the fork.
- Keep local/offline mode available.

## V1 Scope

1. Local Markdown export from a meeting details screen.
2. Custom summary templates that can be created and selected inside the app.
3. A default summary structure that always extracts Summary, Decisions, Action Items, and Follow-ups.
4. Configurable API keys for summary and transcription providers.

## Provider Strategy

Summary providers:

- Keep built-in AI and Ollama for local/offline summaries.
- Keep OpenRouter.
- Add xAI as a first-class OpenAI-compatible preset using `https://api.x.ai/v1`.
- Keep Custom OpenAI-compatible server for future providers.

Transcription providers:

- Keep local Parakeet and Local Whisper.
- Add AssemblyAI as the recommended cloud provider after the app shell is rebranded and export/templates are stable.
- Keep Groq and Deepgram as follow-up provider adapters unless V1 has enough time after packaging.

## Architecture

The fork stays on the existing Next + Tauri + Rust architecture. The app already has SQLite-backed meetings, transcript storage, summary generation, template JSON loading, provider settings, and macOS packaging. V1 should extend those seams instead of adding a parallel notes system.

Markdown export should be a Tauri command that reads meeting metadata, transcript chunks, and summary markdown from SQLite, renders one deterministic Markdown document, and writes it to a user-selected path. The UI should call that command from the meeting details toolbar.

Custom summary templates should reuse the existing template schema and validation. The new UI should let the user save a template JSON file into the app data templates directory through backend commands, then refresh the existing template selector.

Automatic decisions, action items, and follow-ups should be handled by the default bundled template rather than post-processing the LLM output. This keeps one prompt path and avoids duplicate extraction logic.

## Data Flow

1. User records or imports audio.
2. Transcription runs through local provider or configured cloud provider.
3. Summary generation uses the selected summary provider and selected template.
4. The generated summary is saved in the existing summary table.
5. Markdown export renders title, date, summary markdown, transcript, and metadata into a local `.md` file.

## Error Handling

- Export fails if the meeting does not exist or the output path is invalid.
- Template save fails if JSON validation fails or template ID is unsafe.
- Provider settings fail fast when a required API key is missing.
- Cloud providers should never be called unless explicitly selected.

## Verification
