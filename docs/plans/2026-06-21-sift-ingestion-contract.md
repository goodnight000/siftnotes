# Sift Ingestion Contract

## Scope

SiftNotes hands meetings to Sift as one canonical Markdown file per meeting. SiftNotes is responsible for rendering the file; Sift is responsible for ingesting, indexing, deduplicating, and connecting the meeting to the user's broader memory.

This contract intentionally does not include direct sync, action item tracking, meeting Q&A, or a meeting context editor.

## Source File

- Format: Markdown.
- Extension: `.md`.
- Unit of ingestion: one file represents one meeting.
- Source of truth: the same canonical Markdown renderer used by Markdown export and PDF export.
- Local file paths: omitted by default.

## Required Structure

```markdown
# Meeting Title

## Metadata

| Field | Value |
| --- | --- |
| Meeting ID | ... |
| Title | ... |
| Created | ... |
| Updated | ... |
| Exported | ... |
| Transcript segments | ... |
| Includes transcript | Yes |

## Summary

...

## Transcript

...
```

## Metadata Semantics

Sift should treat the `## Metadata` table as structured context, not meeting content. The most stable identifiers are `Meeting ID`, `Created`, and `Updated`. `Exported` is useful for ingestion freshness but should not be used as the meeting's original time.

Optional fields can appear when available:

- `Duration`
- `Transcription`
- `Summary model`
- `Summary status`
- `Summary created`
- `Summary updated`
- `Summary started`
- `Summary completed`
- `Summary processing time`
- `Summary template`
- `App version`

Sift ingestion should tolerate missing optional rows and preserve unknown rows for future compatibility.

## Suggested Sift Behavior

- Use `Meeting ID` as the primary dedupe key when present.
- Fall back to a hash of title, created time, and transcript content when meeting id is missing.
- Index `## Summary` as the highest-signal content.
- Index `## Transcript` as supporting evidence and quote source material.
- Store the full Markdown file so future Sift features can reprocess without asking SiftNotes for another export.

## Versioning

The initial export version is represented by the app package version in `App version`. If this file format starts changing independently of app releases, add a dedicated `Export version` metadata row.
