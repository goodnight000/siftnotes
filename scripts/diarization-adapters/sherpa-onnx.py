#!/usr/bin/env python3
"""Run sherpa-onnx offline diarization and write RTTM for the bakeoff harness."""

from __future__ import annotations

import argparse
import json
import math
import re
import resource
import sys
import wave
from pathlib import Path


SEGMENTATION_MODEL = "models/sherpa-onnx-pyannote-segmentation-3-0/model.onnx"
EMBEDDING_MODEL = "models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
TARGET_SAMPLE_RATE = 16000


def config_template() -> dict:
    return {
        "engine": "sherpa-onnx",
        "engineVersion": "offline-speaker-diarization",
        "format": "rttm",
        "path": "outputs/sherpa-onnx.rttm",
        "modelPaths": [
            SEGMENTATION_MODEL,
            EMBEDDING_MODEL,
        ],
        "run": {
            "command": "python3",
            "args": [
                "scripts/diarization-adapters/sherpa-onnx.py",
                "--audio",
                "{audioPath}",
                "--output",
                "{outputPath}",
                "--segmentation-model",
                SEGMENTATION_MODEL,
                "--embedding-model",
                EMBEDDING_MODEL,
                "--cluster-threshold",
                "0.5",
                "--min-duration-on",
                "0.3",
                "--min-duration-off",
                "0.5",
                "--stats-output",
                "{statsPath}",
            ],
        },
        "practical": {
            "integration": "native",
            "localProcessing": True,
            "licenseUse": "app_default_ok",
            "installComplexity": "native_binary_with_models",
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run sherpa-onnx offline speaker diarization on a local audio file.",
    )
    parser.add_argument("--audio", help="Local audio file to diarize.")
    parser.add_argument("--output", help="RTTM output path.")
    parser.add_argument("--segmentation-model", default=SEGMENTATION_MODEL, help="Pyannote segmentation ONNX model.")
    parser.add_argument("--embedding-model", default=EMBEDDING_MODEL, help="Speaker embedding ONNX model.")
    parser.add_argument("--num-speakers", type=int, default=0, help="Speaker count hint. Use 0 for clustering threshold mode.")
    parser.add_argument("--cluster-threshold", type=float, default=0.5, help="Higher values produce fewer speakers.")
    parser.add_argument("--min-duration-on", type=float, default=0.3, help="Discard speech regions shorter than this many seconds.")
    parser.add_argument("--min-duration-off", type=float, default=0.5, help="Merge speech regions separated by shorter gaps.")
    parser.add_argument("--stats-output", help="Optional JSON sidecar for adapter runtime stats.")
    parser.add_argument("--check-dependencies", action="store_true", help="Import dependencies and exit.")
    parser.add_argument("--print-config-template", action="store_true", help="Print a bakeoff candidate template and exit.")
    return parser


def sanitize_rttm_token(value: object) -> str:
    token = str(value).strip()
    return re.sub(r"\s+", "_", token) if token else "SPEAKER_UNKNOWN"


def file_id(audio_path: str) -> str:
    return sanitize_rttm_token(Path(audio_path).stem or "audio")


def load_dependencies():
    try:
        import numpy as np  # type: ignore
        import sherpa_onnx  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "Missing sherpa-onnx adapter dependency. Install sherpa-onnx and numpy in a local "
            f"environment before running this adapter. Import error: {exc}"
        ) from exc

    return sherpa_onnx, np


def read_pcm_wave(path: str, np_module):
    with wave.open(path, "rb") as handle:
        channels = handle.getnchannels()
        sample_rate = handle.getframerate()
        sample_width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())

    if sample_width != 2:
        raise ValueError("Fallback WAV reader only supports 16-bit PCM. Install soundfile for broader audio support.")

    samples = np_module.frombuffer(frames, dtype=np_module.int16).astype(np_module.float32) / 32768.0
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)

    return samples, sample_rate


def resample_if_needed(samples, sample_rate: int, np_module):
    if sample_rate == TARGET_SAMPLE_RATE:
        return samples

    try:
        from scipy.signal import resample_poly  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            f"Input sample rate is {sample_rate} Hz. Install scipy or provide {TARGET_SAMPLE_RATE} Hz audio."
        ) from exc

    gcd = math.gcd(sample_rate, TARGET_SAMPLE_RATE)
    resampled = resample_poly(samples, TARGET_SAMPLE_RATE // gcd, sample_rate // gcd)
    return np_module.asarray(resampled, dtype=np_module.float32)


def read_audio(path: str, sherpa_onnx, np_module):
    read_wave = getattr(sherpa_onnx, "read_wave", None)
    if callable(read_wave):
        data = read_wave(path)
        if isinstance(data, tuple):
            samples, sample_rate = data[0], data[1]
        else:
            samples = getattr(data, "samples")
            sample_rate = getattr(data, "sample_rate", TARGET_SAMPLE_RATE)
        return resample_if_needed(np_module.asarray(samples, dtype=np_module.float32), int(sample_rate), np_module)

    try:
        import soundfile as sf  # type: ignore

        samples, sample_rate = sf.read(path, dtype="float32", always_2d=False)
        samples = np_module.asarray(samples, dtype=np_module.float32)
        if samples.ndim > 1:
            samples = samples.mean(axis=1)
        return resample_if_needed(samples, int(sample_rate), np_module)
    except ImportError:
        samples, sample_rate = read_pcm_wave(path, np_module)
        return resample_if_needed(samples, sample_rate, np_module)


def speaker_label(value: object) -> str:
    try:
        return f"SPEAKER_{int(value):02d}"
    except (TypeError, ValueError):
        return sanitize_rttm_token(value)


def sorted_segments(result):
    if hasattr(result, "sort_by_start_time"):
        return result.sort_by_start_time()
    return sorted(result, key=lambda segment: float(getattr(segment, "start")))


def write_rttm(segments, output_path: str, source_audio: str) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    source_id = file_id(source_audio)

    with open(output_path, "w", encoding="utf-8") as handle:
        for segment in segments:
            start = float(getattr(segment, "start"))
            end = float(getattr(segment, "end"))
            duration = max(0.0, end - start)
            if duration <= 0:
                continue
            speaker = getattr(segment, "speaker", getattr(segment, "speaker_id", "UNKNOWN"))
            handle.write(
                "SPEAKER "
                f"{source_id} 1 {start:.3f} {duration:.3f} <NA> <NA> "
                f"{speaker_label(speaker)} <NA> <NA>\n"
            )


def peak_memory_mb() -> float:
    peak = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
    if sys.platform == "darwin":
        peak /= 1024 * 1024
    else:
        peak /= 1024
    return round(peak, 6)


def write_stats(stats_output: str | None) -> None:
    if not stats_output:
        return

    Path(stats_output).parent.mkdir(parents=True, exist_ok=True)
    with open(stats_output, "w", encoding="utf-8") as handle:
        json.dump({"peakMemoryMb": peak_memory_mb()}, handle, indent=2)
        handle.write("\n")


def run(args: argparse.Namespace) -> None:
    if not args.audio or not args.output:
        raise SystemExit("--audio and --output are required unless printing a template or checking dependencies.")

    sherpa_onnx, np_module = load_dependencies()
    audio = read_audio(args.audio, sherpa_onnx, np_module)
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=args.segmentation_model,
            ),
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=args.embedding_model,
        ),
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=args.num_speakers,
            threshold=args.cluster_threshold,
        ),
        min_duration_on=args.min_duration_on,
        min_duration_off=args.min_duration_off,
    )
    diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    result = diarizer.process(audio)
    write_rttm(sorted_segments(result), args.output, args.audio)
    write_stats(args.stats_output)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.print_config_template:
        print(json.dumps(config_template(), indent=2))
        return 0

    if args.check_dependencies:
        load_dependencies()
        print(json.dumps({"ok": True, "adapter": "sherpa-onnx"}))
        return 0

    run(args)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
