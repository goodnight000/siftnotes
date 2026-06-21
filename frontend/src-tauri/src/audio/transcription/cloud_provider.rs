// audio/transcription/cloud_provider.rs
//
// Cloud transcription provider implementation for OpenAI-compatible APIs and
// ElevenLabs Scribe.

use super::provider::{TranscriptResult, TranscriptionError, TranscriptionProvider};
use async_trait::async_trait;
use serde::Deserialize;
use std::time::Duration;

const SAMPLE_RATE: u32 = 16_000;
const CHANNELS: u16 = 1;
const BITS_PER_SAMPLE: u16 = 16;
const MIN_AUDIO_SAMPLES: usize = 160;

pub struct CloudTranscriptionProvider {
    provider: String,
    model: String,
    api_key: String,
    client: reqwest::Client,
}

impl CloudTranscriptionProvider {
    pub fn new(provider: String, model: String, api_key: String) -> Result<Self, String> {
        let provider = provider.trim().to_string();
        let model = model.trim().to_string();
        let api_key = api_key.trim().to_string();

        if endpoint_for_provider(&provider).is_none() {
            return Err(format!(
                "Unsupported cloud transcription provider: {}",
                provider
            ));
        }

        if model.is_empty() {
            return Err(format!(
                "{} transcription requires a model.",
                provider_label(&provider)
            ));
        }

        if api_key.is_empty() {
            return Err(format!(
                "{} transcription requires an API key.",
                provider_label(&provider)
            ));
        }

        Ok(Self {
            provider,
            model,
            api_key,
            client: reqwest::Client::new(),
        })
    }
}

#[async_trait]
impl TranscriptionProvider for CloudTranscriptionProvider {
    async fn transcribe(
        &self,
        audio: Vec<f32>,
        language: Option<String>,
    ) -> std::result::Result<TranscriptResult, TranscriptionError> {
        if audio.len() < MIN_AUDIO_SAMPLES {
            return Err(TranscriptionError::AudioTooShort {
                samples: audio.len(),
                minimum: MIN_AUDIO_SAMPLES,
            });
        }

        let endpoint = endpoint_for_provider(&self.provider).ok_or_else(|| {
            TranscriptionError::EngineFailed(format!(
                "Unsupported cloud transcription provider: {}",
                self.provider
            ))
        })?;
        let request_kind = request_kind_for_provider(&self.provider).ok_or_else(|| {
            TranscriptionError::EngineFailed(format!(
                "Unsupported cloud transcription provider: {}",
                self.provider
            ))
        })?;

        let wav_bytes = encode_wav_16khz_mono(&audio);
        let file_part = reqwest::multipart::Part::bytes(wav_bytes)
            .file_name("chunk.wav")
            .mime_str("audio/wav")
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        let mut form = reqwest::multipart::Form::new().part("file", file_part);

        let language = normalize_cloud_language_hint(language);

        let mut request = self.client.post(endpoint);

        match request_kind {
            CloudRequestKind::OpenAiCompatible => {
                form = form
                    .text("model", self.model.clone())
                    .text("response_format", "json");

                if let Some(language) = language {
                    form = form.text("language", language);
                }

                request = request.bearer_auth(&self.api_key);
            }
            CloudRequestKind::ElevenLabsScribe => {
                form = form
                    .text("model_id", self.model.clone())
                    .text("tag_audio_events", "false")
                    .text("timestamps_granularity", "none")
                    .text("diarize", "false");

                if let Some(language) = language {
                    form = form.text("language_code", language);
                }

                request = request.header("xi-api-key", &self.api_key);
            }
        }

        let response = request
            .multipart(form)
            .timeout(Duration::from_secs(90))
            .send()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        let status = response.status();
        let body = response
            .text()
            .await
            .map_err(|e| TranscriptionError::EngineFailed(e.to_string()))?;

        if !status.is_success() {
            return Err(TranscriptionError::EngineFailed(format!(
                "{} transcription failed with HTTP {}: {}",
                provider_label(&self.provider),
                status,
                body
            )));
        }

        let parsed: CloudTranscriptionResponse = serde_json::from_str(&body).map_err(|e| {
            TranscriptionError::EngineFailed(format!(
                "Failed to parse transcription response: {}",
                e
            ))
        })?;

        Ok(TranscriptResult {
            text: parsed.text.trim().to_string(),
            confidence: None,
            is_partial: false,
        })
    }

    async fn is_model_loaded(&self) -> bool {
        !self.model.is_empty() && !self.api_key.is_empty()
    }

    async fn get_current_model(&self) -> Option<String> {
        Some(self.model.clone())
    }

    fn provider_name(&self) -> &'static str {
        match self.provider.as_str() {
            "elevenLabs" => "ElevenLabs Scribe",
            "groq" => "Groq Cloud",
            "openai" => "OpenAI Cloud",
            _ => "Cloud",
        }
    }
}

#[derive(Debug, Deserialize)]
struct CloudTranscriptionResponse {
    text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CloudRequestKind {
    OpenAiCompatible,
    ElevenLabsScribe,
}

fn request_kind_for_provider(provider: &str) -> Option<CloudRequestKind> {
    match provider {
        "elevenLabs" => Some(CloudRequestKind::ElevenLabsScribe),
        "groq" | "openai" => Some(CloudRequestKind::OpenAiCompatible),
        _ => None,
    }
}

fn endpoint_for_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "elevenLabs" => Some("https://api.elevenlabs.io/v1/speech-to-text"),
        "groq" => Some("https://api.groq.com/openai/v1/audio/transcriptions"),
        "openai" => Some("https://api.openai.com/v1/audio/transcriptions"),
        _ => None,
    }
}

fn provider_label(provider: &str) -> &'static str {
    match provider {
        "elevenLabs" => "ElevenLabs",
        "groq" => "Groq",
        "openai" => "OpenAI",
        _ => "Cloud",
    }
}

fn normalize_cloud_language_hint(language: Option<String>) -> Option<String> {
    let language = language?.trim().to_string();

    if language.is_empty() || matches!(language.as_str(), "auto" | "auto-translate") {
        return None;
    }

    Some(language)
}

fn encode_wav_16khz_mono(samples: &[f32]) -> Vec<u8> {
    let data_size = samples.len() as u32 * 2;
    let byte_rate = SAMPLE_RATE * CHANNELS as u32 * BITS_PER_SAMPLE as u32 / 8;
    let block_align = CHANNELS * BITS_PER_SAMPLE / 8;
    let mut wav = Vec::with_capacity(44 + data_size as usize);

    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_size).to_le_bytes());
    wav.extend_from_slice(b"WAVE");
    wav.extend_from_slice(b"fmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&CHANNELS.to_le_bytes());
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&BITS_PER_SAMPLE.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_size.to_le_bytes());

    for sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let pcm = (clamped * i16::MAX as f32) as i16;
        wav.extend_from_slice(&pcm.to_le_bytes());
    }

    wav
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_wav_header_for_16khz_mono_pcm() {
        let wav = encode_wav_16khz_mono(&[0.0, 1.0, -1.0]);

        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 6);
    }

    #[test]
    fn creates_elevenlabs_scribe_provider() {
        let provider = CloudTranscriptionProvider::new(
            "elevenLabs".to_string(),
            "scribe_v2".to_string(),
            "test-key".to_string(),
        )
        .expect("ElevenLabs Scribe should be a supported cloud provider");

        assert_eq!(provider.provider_name(), "ElevenLabs Scribe");
        assert_eq!(
            endpoint_for_provider("elevenLabs"),
            Some("https://api.elevenlabs.io/v1/speech-to-text")
        );
    }

    #[test]
    fn omits_auto_language_hints_for_cloud_transcription() {
        assert_eq!(normalize_cloud_language_hint(Some("auto".to_string())), None);
        assert_eq!(
            normalize_cloud_language_hint(Some("auto-translate".to_string())),
            None
        );
        assert_eq!(normalize_cloud_language_hint(Some("  ".to_string())), None);
    }

    #[test]
    fn preserves_explicit_cloud_language_hints() {
        assert_eq!(
            normalize_cloud_language_hint(Some(" en ".to_string())),
            Some("en".to_string())
        );
    }
}
