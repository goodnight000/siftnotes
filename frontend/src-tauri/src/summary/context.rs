use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Clone, Default, PartialEq)]
pub(crate) struct MeetingSummaryContext {
    pub meeting_id: String,
    pub title: Option<String>,
    pub happened_at: Option<String>,
    pub updated_at: Option<String>,
    pub completed_at: Option<String>,
    pub duration_seconds: Option<f64>,
    pub transcript_count: usize,
    pub project: Option<String>,
    pub tags: Vec<String>,
    pub source: Option<String>,
    pub audio_file: Option<String>,
    pub transcription_provider: Option<String>,
    pub transcription_model: Option<String>,
    pub summary_provider: Option<String>,
    pub summary_model: Option<String>,
    pub summary_template: Option<String>,
}

impl MeetingSummaryContext {
    pub(crate) fn to_prompt_block(&self) -> String {
        let mut block = String::new();
        block.push_str("<meeting_metadata>\n");
        block.push_str(
            "Use these metadata facts for meeting title/date context. The app appends the exact Metadata section after the report. Transcript prefixes like [03:14] are recording-relative timestamps; use them for Timeline references.\n\n",
        );
        block.push_str(&self.to_markdown_table());
        block.push_str("</meeting_metadata>");
        block
    }

    pub(crate) fn to_markdown_section(&self) -> String {
        format!("**Metadata**\n\n{}", self.to_markdown_table().trim_end())
    }

    fn to_markdown_table(&self) -> String {
        let mut table = String::new();
        table.push_str("| Field | Value |\n");
        table.push_str("| --- | --- |\n");

        push_row(&mut table, "Meeting ID", Some(self.meeting_id.as_str()));
        push_row(&mut table, "Title", self.title.as_deref());
        push_row(
            &mut table,
            "Meeting happened at",
            self.happened_at.as_deref(),
        );
        push_row(&mut table, "Last updated at", self.updated_at.as_deref());
        push_row(&mut table, "Completed at", self.completed_at.as_deref());

        let duration = self.duration_seconds.map(format_duration);
        push_row(&mut table, "Duration", duration.as_deref());

        if self.transcript_count > 0 {
            let transcript_count = self.transcript_count.to_string();
            push_row(
                &mut table,
                "Transcript segments",
                Some(transcript_count.as_str()),
            );
        }

        push_row(&mut table, "Project", self.project.as_deref());

        if !self.tags.is_empty() {
            let tags = self.tags.join(", ");
            push_row(&mut table, "Tags", Some(tags.as_str()));
        }

        push_row(&mut table, "Source", self.source.as_deref());
        push_row(&mut table, "Audio file", self.audio_file.as_deref());

        let transcription = combine_provider_model(
            self.transcription_provider.as_deref(),
            self.transcription_model.as_deref(),
        );
        push_row(&mut table, "Transcription model", transcription.as_deref());

        let summary = combine_provider_model(
            self.summary_provider.as_deref(),
            self.summary_model.as_deref(),
        );
        push_row(&mut table, "Summary model", summary.as_deref());
        push_row(
            &mut table,
            "Summary template",
            self.summary_template.as_deref(),
        );

        table
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub(crate) struct MeetingFolderSummaryMetadata {
    pub created_at: Option<String>,
    pub completed_at: Option<String>,
    pub duration_seconds: Option<f64>,
    pub audio_file: Option<String>,
    pub source: Option<String>,
}

impl MeetingFolderSummaryMetadata {
    pub(crate) fn read_from_folder(folder: &Path) -> Result<Option<Self>, String> {
        let path = folder.join("metadata.json");
        if !path.exists() {
            return Ok(None);
        }

        let raw = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
        serde_json::from_str::<Self>(&raw)
            .map(Some)
            .map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
    }
}

fn push_row(markdown: &mut String, field: &str, value: Option<&str>) {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return;
    };

    markdown.push_str("| ");
    markdown.push_str(&escape_table_cell(field));
    markdown.push_str(" | ");
    markdown.push_str(&escape_table_cell(value));
    markdown.push_str(" |\n");
}

fn escape_table_cell(value: &str) -> String {
    value.replace('|', "\\|").replace('\n', " ")
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

fn format_duration(seconds: f64) -> String {
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
