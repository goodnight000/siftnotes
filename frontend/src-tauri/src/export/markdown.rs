#[derive(Debug, Clone)]
pub struct ExportMeeting {
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
    pub summary_markdown: Option<String>,
    pub transcripts: Vec<ExportTranscript>,
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
    markdown.push_str("- Created: ");
    markdown.push_str(meeting.created_at.trim());
    markdown.push('\n');
    markdown.push_str("- Updated: ");
    markdown.push_str(meeting.updated_at.trim());
    markdown.push_str("\n\n");

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
        assert!(markdown.contains("- Created: 2026-06-21T10:00:00Z\n"));
        assert!(markdown.contains("- Updated: 2026-06-21T10:45:00Z\n"));
        assert!(markdown.contains("## Summary\nProject health is stable."));
        assert!(markdown.contains("## Action Items\n- Alice will send the launch brief."));
        assert!(markdown.contains(
            "## Transcript\n\n- [10:12 | 00:12-00:18] We approved the launch plan."
        ));
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
