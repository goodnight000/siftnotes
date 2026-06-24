use std::path::Path;

use crate::{
    database::repositories::{
        meeting::MeetingsRepository, setting::SettingsRepository,
        summary::SummaryProcessesRepository,
    },
    state::AppState,
};
use chrono::Utc;
use serde_json::Value;
use tauri::{AppHandle, Runtime};
use tracing::{info, warn};

pub mod markdown;
pub mod pdf;

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
    let export_meeting = load_export_meeting(pool, &meeting_id).await?;
    let markdown = markdown::render_meeting_markdown(&export_meeting);

    write_export_file(output_path, markdown, "Markdown")?;

    info!("Exported meeting {} to {}", meeting_id, output_path);
    Ok(output_path.to_string())
}

#[tauri::command]
pub async fn api_export_meeting_pdf<R: Runtime>(
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
    let export_meeting = load_export_meeting(pool, &meeting_id).await?;
    let markdown = markdown::render_meeting_markdown(&export_meeting);
    let pdf = pdf::render_markdown_pdf(&markdown)?;

    write_export_file(output_path, pdf, "PDF")?;

    info!("Exported meeting {} PDF to {}", meeting_id, output_path);
    Ok(output_path.to_string())
}

async fn load_export_meeting(
    pool: &sqlx::SqlitePool,
    meeting_id: &str,
) -> Result<markdown::ExportMeeting, String> {
    let meeting = MeetingsRepository::get_meeting(pool, &meeting_id)
        .await
        .map_err(|e| format!("Failed to load meeting: {e}"))?
        .ok_or_else(|| format!("Meeting not found: {meeting_id}"))?;

    let summary_process =
        match SummaryProcessesRepository::get_summary_data(pool, &meeting_id).await {
            Ok(process) => process,
            Err(error) => {
                warn!("Failed to load summary metadata for export: {}", error);
                None
            }
        };

    let summary_markdown = summary_process
        .as_ref()
        .and_then(|process| process.result.as_deref())
        .and_then(markdown::extract_summary_markdown);

    let summary_source = summary_process
        .as_ref()
        .and_then(|process| process.result.as_deref())
        .map(extract_summary_source_metadata)
        .unwrap_or_default();

    let summary_config = match SettingsRepository::get_model_config(pool).await {
        Ok(config) => config,
        Err(error) => {
            warn!(
                "Failed to load summary provider settings for export: {}",
                error
            );
            None
        }
    };

    let transcript_config = match SettingsRepository::get_transcript_config(pool).await {
        Ok(config) => config,
        Err(error) => {
            warn!(
                "Failed to load transcription provider settings for export: {}",
                error
            );
            None
        }
    };

    let duration_seconds = meeting
        .transcripts
        .iter()
        .filter_map(|transcript| transcript.audio_end_time)
        .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
        .max_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let transcript_count = meeting.transcripts.len();
    let summary_provider = summary_source.provider.or_else(|| {
        summary_config
            .as_ref()
            .map(|config| config.provider.clone())
    });
    let summary_model = summary_source
        .model
        .or_else(|| summary_config.as_ref().map(|config| config.model.clone()));
    let summary_template = summary_source.template;

    Ok(markdown::ExportMeeting {
        metadata: markdown::ExportMetadata {
            meeting_id: meeting.id.clone(),
            exported_at: Utc::now().to_rfc3339(),
            duration_seconds,
            transcript_count,
            transcription_provider: transcript_config
                .as_ref()
                .map(|config| config.provider.clone()),
            transcription_model: transcript_config
                .as_ref()
                .map(|config| config.model.clone()),
            summary_provider,
            summary_model,
            summary_status: summary_process
                .as_ref()
                .map(|process| process.status.clone()),
            summary_created_at: summary_process
                .as_ref()
                .map(|process| process.created_at.to_rfc3339()),
            summary_updated_at: summary_process
                .as_ref()
                .map(|process| process.updated_at.to_rfc3339()),
            summary_started_at: summary_process
                .as_ref()
                .and_then(|process| process.start_time.map(|value| value.to_rfc3339())),
            summary_completed_at: summary_process
                .as_ref()
                .and_then(|process| process.end_time.map(|value| value.to_rfc3339())),
            summary_processing_time_seconds: summary_process
                .as_ref()
                .map(|process| process.processing_time)
                .filter(|seconds| seconds.is_finite() && *seconds > 0.0),
            summary_template,
            app_version: Some(env!("CARGO_PKG_VERSION").to_string()),
            includes_transcript: true,
        },
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
    })
}

#[derive(Default)]
struct SummarySourceMetadata {
    provider: Option<String>,
    model: Option<String>,
    template: Option<String>,
}

fn extract_summary_source_metadata(result_json: &str) -> SummarySourceMetadata {
    let Ok(value) = serde_json::from_str::<Value>(result_json) else {
        return SummarySourceMetadata::default();
    };

    let source = value.pointer("/english_cache/source");
    SummarySourceMetadata {
        provider: string_at(source, "model_provider"),
        model: string_at(source, "model_name"),
        template: string_at(source, "template_id"),
    }
}

fn string_at(value: Option<&Value>, key: &str) -> Option<String> {
    value?
        .get(key)?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn write_export_file(
    output_path: &str,
    content: impl AsRef<[u8]>,
    label: &str,
) -> Result<(), String> {
    let path = Path::new(output_path);
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create export directory: {e}"))?;
    }
    std::fs::write(path, content).map_err(|e| format!("Failed to write {label} export: {e}"))?;

    Ok(())
}
