use std::path::Path;

use crate::{
    database::repositories::{
        meeting::MeetingsRepository,
        summary::SummaryProcessesRepository,
    },
    state::AppState,
};
use tauri::{AppHandle, Runtime};
use tracing::{info, warn};

pub mod markdown;

#[tauri::command]
pub async fn api_export_meeting_markdown<R: Runtime>(
    _app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    meeting_id: String,
    output_path: String,
) -> Result<String, String> {
    let output_path = output_path.trim();
    if output_path.is_empty() {
        return Err("Output path cannot be empty".to_string());
    }

    let pool = state.db_manager.pool();
    let meeting = MeetingsRepository::get_meeting(pool, &meeting_id)
        .await
        .map_err(|e| format!("Failed to load meeting: {e}"))?
        .ok_or_else(|| format!("Meeting not found: {meeting_id}"))?;

    let summary_markdown = match SummaryProcessesRepository::get_summary_data(pool, &meeting_id).await {
        Ok(Some(process)) => process
            .result
            .as_deref()
            .and_then(markdown::extract_summary_markdown),
        Ok(None) => None,
        Err(error) => {
            warn!("Failed to load summary for export: {}", error);
            None
        }
    };

    let export_meeting = markdown::ExportMeeting {
        title: meeting.title,
        created_at: meeting.created_at,
        updated_at: meeting.updated_at,
        summary_markdown,
        transcripts: meeting
            .transcripts
            .into_iter()
            .map(|transcript| markdown::ExportTranscript {
                text: transcript.text,
                timestamp: transcript.timestamp,
                audio_start_time: transcript.audio_start_time,
                audio_end_time: transcript.audio_end_time,
            })
            .collect(),
    };

    let markdown = markdown::render_meeting_markdown(&export_meeting);
    let path = Path::new(output_path);
    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create export directory: {e}"))?;
    }
    std::fs::write(path, markdown)
        .map_err(|e| format!("Failed to write Markdown export: {e}"))?;

    info!("Exported meeting {} to {}", meeting_id, output_path);
    Ok(output_path.to_string())
}
