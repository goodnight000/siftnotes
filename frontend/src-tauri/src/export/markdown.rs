#[derive(Debug, Clone)]
pub struct ExportMeeting {
    pub metadata: ExportMetadata,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub summary_markdown: Option<String>,
    pub transcripts: Vec<ExportTranscript>,
}

#[derive(Debug, Clone)]
pub struct ExportMetadata {
    pub meeting_id: String,
    pub exported_at: String,
    pub duration_seconds: Option<f64>,
    pub transcript_count: usize,
    pub transcription_provider: Option<String>,
    pub transcription_model: Option<String>,
    pub summary_provider: Option<String>,
    pub summary_model: Option<String>,
    pub summary_status: Option<String>,
    pub summary_created_at: Option<String>,
    pub summary_updated_at: Option<String>,
    pub summary_started_at: Option<String>,
    pub summary_completed_at: Option<String>,
    pub summary_processing_time_seconds: Option<f64>,
    pub summary_template: Option<String>,
    pub app_version: Option<String>,
    pub includes_transcript: bool,
}

#[derive(Debug, Clone)]
pub struct ExportTranscript {
    pub text: String,
    pub timestamp: String,
    pub audio_start_time: Option<f64>,
    pub audio_end_time: Option<f64>,
}

pub fn render_meeting_markdown(meeting: &ExportMeeting) -> String {
    let mut markdown = String::new();

    markdown.push_str("# ");
    markdown.push_str(meeting.title.trim());
    markdown.push_str("\n\n");
    render_metadata_section(&mut markdown, meeting);

    match meeting
        .summary_markdown
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(summary) if summary.starts_with('#') => {
            markdown.push_str(summary);
            markdown.push_str("\n\n");
        }
        Some(summary) => {
            markdown.push_str("## Summary\n\n");
            markdown.push_str(summary);
            markdown.push_str("\n\n");
        }
        None => {
            markdown.push_str("## Summary\n\n_No summary generated yet._\n\n");
        }
    }

    markdown.push_str("## Transcript\n\n");
    if meeting.transcripts.is_empty() {
        markdown.push_str("_No transcript available._\n");
        return markdown;
    }

    for transcript in &meeting.transcripts {
        let text = transcript.text.trim();
        if text.is_empty() {
            continue;
        }

        markdown.push_str("- [");
        markdown.push_str(transcript.timestamp.trim());
        if let (Some(start), Some(end)) = (transcript.audio_start_time, transcript.audio_end_time) {
            markdown.push_str(" | ");
            markdown.push_str(&format_audio_time(start));
            markdown.push('-');
            markdown.push_str(&format_audio_time(end));
        }
        markdown.push_str("] ");
        markdown.push_str(text);
        markdown.push('\n');
    }

    markdown
}

fn render_metadata_section(markdown: &mut String, meeting: &ExportMeeting) {
    markdown.push_str("## Metadata\n\n");
    markdown.push_str("| Field | Value |\n");
    markdown.push_str("| --- | --- |\n");

    push_metadata_row(
        markdown,
        "Meeting ID",
        Some(meeting.metadata.meeting_id.as_str()),
    );
    push_metadata_row(markdown, "Title", Some(meeting.title.as_str()));
    push_metadata_row(markdown, "Created", Some(meeting.created_at.as_str()));
    push_metadata_row(markdown, "Updated", Some(meeting.updated_at.as_str()));
    push_metadata_row(
        markdown,
        "Exported",
        Some(meeting.metadata.exported_at.as_str()),
    );

    let duration = meeting.metadata.duration_seconds.map(format_audio_time);
    push_metadata_row(markdown, "Duration", duration.as_deref());

    let transcript_count = meeting.metadata.transcript_count.to_string();
    push_metadata_row(
        markdown,
        "Transcript segments",
        Some(transcript_count.as_str()),
    );

    let transcription = combine_provider_model(
        meeting.metadata.transcription_provider.as_deref(),
        meeting.metadata.transcription_model.as_deref(),
    );
    push_metadata_row(markdown, "Transcription", transcription.as_deref());

    let summary_model = combine_provider_model(
        meeting.metadata.summary_provider.as_deref(),
        meeting.metadata.summary_model.as_deref(),
    );
    push_metadata_row(markdown, "Summary model", summary_model.as_deref());
    push_metadata_row(
        markdown,
        "Summary status",
        meeting.metadata.summary_status.as_deref(),
    );
    push_metadata_row(
        markdown,
        "Summary created",
        meeting.metadata.summary_created_at.as_deref(),
    );
    push_metadata_row(
        markdown,
        "Summary updated",
        meeting.metadata.summary_updated_at.as_deref(),
    );
    push_metadata_row(
        markdown,
        "Summary started",
        meeting.metadata.summary_started_at.as_deref(),
    );
    push_metadata_row(
        markdown,
        "Summary completed",
        meeting.metadata.summary_completed_at.as_deref(),
    );

    let processing_time = meeting
        .metadata
        .summary_processing_time_seconds
        .map(format_audio_time);
    push_metadata_row(
        markdown,
        "Summary processing time",
        processing_time.as_deref(),
    );
    push_metadata_row(
        markdown,
        "Summary template",
        meeting.metadata.summary_template.as_deref(),
    );
    push_metadata_row(
        markdown,
        "App version",
        meeting.metadata.app_version.as_deref(),
    );
    push_metadata_row(
        markdown,
        "Includes transcript",
        Some(if meeting.metadata.includes_transcript {
            "Yes"
        } else {
            "No"
        }),
    );

    markdown.push('\n');
}

fn combine_provider_model(provider: Option<&str>, model: Option<&str>) -> Option<String> {
    let provider = provider.map(str::trim).filter(|value| !value.is_empty());
    let model = model.map(str::trim).filter(|value| !value.is_empty());

    match (provider, model) {
        (Some(provider), Some(model)) => Some(format!("{provider} / {model}")),
        (Some(provider), None) => Some(provider.to_string()),
        (None, Some(model)) => Some(model.to_string()),
        (None, None) => None,
    }
}

fn push_metadata_row(markdown: &mut String, label: &str, value: Option<&str>) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };

    markdown.push_str("| ");
    markdown.push_str(&escape_table_cell(label));
    markdown.push_str(" | ");
    markdown.push_str(&escape_table_cell(value));
    markdown.push_str(" |\n");
}

fn escape_table_cell(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', " ")
}

pub fn extract_summary_markdown(result_json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(result_json).ok()?;
    markdown_from_value(value.get("markdown"))
        .or_else(|| markdown_from_value(value.pointer("/metadata/english_markdown")))
}

fn markdown_from_value(value: Option<&serde_json::Value>) -> Option<String> {
    value
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn format_audio_time(seconds: f64) -> String {
    let total_seconds = if seconds.is_finite() && seconds > 0.0 {
        seconds.floor() as u64
    } else {
        0
    };

    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;

    if hours > 0 {
        format!("{hours:02}:{minutes:02}:{seconds:02}")
    } else {
        format!("{minutes:02}:{seconds:02}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_summary_and_transcript_markdown() {
        let meeting = ExportMeeting {
            metadata: ExportMetadata {
                meeting_id: "meeting-123".to_string(),
                exported_at: "2026-06-21T18:30:00Z".to_string(),
                duration_seconds: Some(642.0),
                transcript_count: 2,
                transcription_provider: Some("elevenLabs".to_string()),
                transcription_model: Some("scribe_v2".to_string()),
                summary_provider: Some("openrouter".to_string()),
                summary_model: Some("openai/gpt-4o-mini".to_string()),
                summary_status: Some("completed".to_string()),
                summary_created_at: Some("2026-06-21T10:20:00Z".to_string()),
                summary_updated_at: Some("2026-06-21T10:45:00Z".to_string()),
                summary_started_at: Some("2026-06-21T10:21:00Z".to_string()),
                summary_completed_at: Some("2026-06-21T10:23:00Z".to_string()),
                summary_processing_time_seconds: Some(122.4),
                summary_template: Some("standard_meeting".to_string()),
                app_version: Some("0.4.0".to_string()),
                includes_transcript: true,
            },
            title: "Roadmap Sync".to_string(),
            created_at: "2026-06-21T10:00:00Z".to_string(),
            updated_at: "2026-06-21T10:45:00Z".to_string(),
            summary_markdown: Some(
                "## Summary\nProject health is stable.\n\n## Action Items\n- Alice will send the launch brief.".to_string(),
            ),
            transcripts: vec![
                ExportTranscript {
                    text: "We approved the launch plan.".to_string(),
                    timestamp: "10:12".to_string(),
                    audio_start_time: Some(12.4),
                    audio_end_time: Some(18.8),
                },
                ExportTranscript {
                    text: "Alice owns the launch brief.".to_string(),
                    timestamp: "10:18".to_string(),
                    audio_start_time: None,
                    audio_end_time: None,
                },
            ],
        };

        let markdown = render_meeting_markdown(&meeting);

        assert!(markdown.starts_with("# Roadmap Sync\n\n"));
        assert!(markdown.contains("## Metadata\n\n"));
        assert!(markdown.contains("| Meeting ID | meeting-123 |\n"));
        assert!(markdown.contains("| Created | 2026-06-21T10:00:00Z |\n"));
        assert!(markdown.contains("| Updated | 2026-06-21T10:45:00Z |\n"));
        assert!(markdown.contains("| Exported | 2026-06-21T18:30:00Z |\n"));
        assert!(markdown.contains("| Duration | 10:42 |\n"));
        assert!(markdown.contains("| Transcript segments | 2 |\n"));
        assert!(markdown.contains("| Transcription | elevenLabs / scribe_v2 |\n"));
        assert!(markdown.contains("| Summary model | openrouter / openai/gpt-4o-mini |\n"));
        assert!(markdown.contains("| Summary status | completed |\n"));
        assert!(markdown.contains("| Summary template | standard_meeting |\n"));
        assert!(markdown.contains("| App version | 0.4.0 |\n"));
        assert!(markdown.contains("| Includes transcript | Yes |\n"));
        assert!(markdown.contains("## Summary\nProject health is stable."));
        assert!(markdown.contains("## Action Items\n- Alice will send the launch brief."));
        assert!(markdown
            .contains("## Transcript\n\n- [10:12 | 00:12-00:18] We approved the launch plan."));
        assert!(markdown.contains("- [10:18] Alice owns the launch brief."));
    }

    #[test]
    fn extracts_markdown_from_saved_summary_result() {
        let result_json = r###"{
            "markdown": "## Summary\nDone",
            "summary_json": []
        }"###;

        assert_eq!(
            extract_summary_markdown(result_json),
            Some("## Summary\nDone".to_string())
        );
    }

    #[test]
    fn extracts_metadata_markdown_fallback() {
        let result_json = r###"{
            "metadata": {
                "english_markdown": "## Summary\nTranslated"
            }
        }"###;

        assert_eq!(
            extract_summary_markdown(result_json),
            Some("## Summary\nTranslated".to_string())
        );
    }
}
