#!/usr/bin/env python3
"""Convert separated speaker/channel WAV files into RTTM with simple energy VAD."""

from __future__ import annotations

import argparse
import json
import math
import wave
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create RTTM from separated local WAV channels using per-channel energy activity.",
    )
    parser.add_argument(
        "--channel",
        action="append",
        default=[],
        help="Speaker/channel mapping in SPEAKER=/path/to.wav form. May be repeated.",
    )
    parser.add_argument("--output", help="RTTM output path.")
    parser.add_argument("--file-id", default="separated")
    parser.add_argument("--window-seconds", type=float, default=0.05)
    parser.add_argument("--threshold-ratio", type=float, default=0.08)
    parser.add_argument("--min-duration", type=float, default=0.15)
    parser.add_argument("--min-gap", type=float, default=0.10)
    parser.add_argument("--stats-output", help="Optional JSON sidecar.")
    parser.add_argument("--check-dependencies", action="store_true")
    return parser


def parse_channel(value: str) -> tuple[str, str]:
    if "=" not in value:
        raise ValueError("--channel must be in SPEAKER=/path/to.wav form")
    speaker, path = value.split("=", 1)
    speaker = speaker.strip()
    path = path.strip()
    if not speaker or not path:
        raise ValueError("--channel must include both speaker and path")
    return speaker, path


def read_wave_mono(path: str) -> tuple[list[float], int]:
    with wave.open(path, "rb") as handle:
        channels = handle.getnchannels()
        sample_rate = handle.getframerate()
        sample_width = handle.getsampwidth()
        frames = handle.readframes(handle.getnframes())

    if sample_width != 2:
        raise ValueError(f"{path}: only 16-bit PCM WAV is supported")

    samples = []
    frame_count = len(frames) // (sample_width * channels)
    for frame_index in range(frame_count):
        total = 0.0
        for channel_index in range(channels):
            offset = (frame_index * channels + channel_index) * sample_width
            sample = int.from_bytes(frames[offset:offset + sample_width], "little", signed=True)
            total += sample / 32768.0
        samples.append(total / channels)
    return samples, sample_rate


def window_rms(samples: list[float], start: int, end: int) -> float:
    if end <= start:
        return 0.0
    total = sum(sample * sample for sample in samples[start:end])
    return math.sqrt(total / (end - start))


def raw_segments(samples: list[float], sample_rate: int, window_seconds: float, threshold_ratio: float):
    window_size = max(1, int(round(window_seconds * sample_rate)))
    rms_values = [
        window_rms(samples, start, min(len(samples), start + window_size))
        for start in range(0, len(samples), window_size)
    ]
    peak = max(rms_values, default=0.0)
    if peak <= 0:
        return []

    threshold = peak * threshold_ratio
    segments = []
    active_start = None
    for index, rms in enumerate(rms_values):
        active = rms >= threshold
        start_seconds = index * window_size / sample_rate
        end_seconds = min(len(samples), (index + 1) * window_size) / sample_rate
        if active and active_start is None:
            active_start = start_seconds
        elif not active and active_start is not None:
            segments.append((active_start, start_seconds))
            active_start = None

        if index == len(rms_values) - 1 and active_start is not None:
            segments.append((active_start, end_seconds))

    return segments


def merge_segments(segments, min_duration: float, min_gap: float):
    merged = []
    for start, end in segments:
        if not merged or start - merged[-1][1] > min_gap:
            merged.append([start, end])
        else:
            merged[-1][1] = end

    return [
        (round(start, 3), round(end, 3))
        for start, end in merged
        if end - start >= min_duration
    ]


def write_rttm(turns, output_path: str, file_id: str) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        for speaker, start, end in sorted(turns, key=lambda turn: (turn[1], turn[2], turn[0])):
            duration = round(end - start, 3)
            handle.write(
                f"SPEAKER {file_id} 1 {start:.3f} {duration:.3f} <NA> <NA> {speaker} <NA> <NA>\n"
            )


def write_stats(stats_output: str | None, turns, channels) -> None:
    if not stats_output:
        return
    Path(stats_output).parent.mkdir(parents=True, exist_ok=True)
    with open(stats_output, "w", encoding="utf-8") as handle:
        json.dump({
            "speakerCount": len(channels),
            "turnCount": len(turns),
        }, handle, indent=2)
        handle.write("\n")


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.check_dependencies:
        print(json.dumps({"ok": True, "adapter": "separated-channel-energy"}))
        return 0

    if not args.output or not args.channel:
        raise SystemExit("--output and at least one --channel are required")

    channels = [parse_channel(value) for value in args.channel]
    turns = []
    for speaker, audio_path in channels:
        samples, sample_rate = read_wave_mono(audio_path)
        for start, end in merge_segments(
            raw_segments(samples, sample_rate, args.window_seconds, args.threshold_ratio),
            min_duration=args.min_duration,
            min_gap=args.min_gap,
        ):
            turns.append((speaker, start, end))

    write_rttm(turns, args.output, args.file_id)
    write_stats(args.stats_output, turns, channels)
    print(json.dumps({
        "output": str(Path(args.output).resolve()),
        "speakerCount": len(channels),
        "turnCount": len(turns),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
