#!/usr/bin/env python3
"""Run pyannote Community-1 diarization and write RTTM for the bakeoff harness."""

from __future__ import annotations

import argparse
import json
import os
import re
import resource
import sys
from pathlib import Path


MODEL_ID = "pyannote/speaker-diarization-community-1"


def config_template() -> dict:
    return {
        "engine": "pyannote-community-1",
        "engineVersion": MODEL_ID,
        "format": "rttm",
        "path": "outputs/pyannote-community-1.rttm",
        "modelPaths": [
            "models/pyannote/speaker-diarization-community-1",
        ],
        "run": {
            "command": "python3",
            "args": [
                "scripts/diarization-adapters/pyannote-community-1.py",
                "--audio",
                "{audioPath}",
                "--output",
                "{outputPath}",
                "--device",
                "auto",
                "--stats-output",
                "{statsPath}",
            ],
        },
        "practical": {
            "integration": "python-sidecar",
            "localProcessing": True,
            "licenseUse": "gated_model_notice_required",
            "installComplexity": "python_sidecar_with_models",
        },
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run pyannote Community-1 speaker diarization on a local audio file.",
    )
    parser.add_argument("--audio", help="Local audio file to diarize.")
    parser.add_argument("--output", help="RTTM output path.")
    parser.add_argument("--model", default=MODEL_ID, help="Hugging Face model id.")
    parser.add_argument("--hf-token", default=None, help="Hugging Face token. Defaults to HF_TOKEN or HUGGINGFACE_TOKEN.")
    parser.add_argument("--device", default="auto", choices=["auto", "cpu", "cuda", "mps"], help="Torch device.")
    parser.add_argument("--num-speakers", type=int, default=None, help="Force exact speaker count.")
    parser.add_argument("--min-speakers", type=int, default=None, help="Minimum speaker count hint.")
    parser.add_argument("--max-speakers", type=int, default=None, help="Maximum speaker count hint.")
    parser.add_argument("--stats-output", help="Optional JSON sidecar for adapter runtime stats.")
    parser.add_argument("--check-dependencies", action="store_true", help="Import dependencies and exit.")
    parser.add_argument(
        "--check-model-access",
        action="store_true",
        help="Load the configured pyannote model and exit without processing audio.",
    )
    parser.add_argument("--print-config-template", action="store_true", help="Print a bakeoff candidate template and exit.")
    return parser


def sanitize_rttm_token(value: object) -> str:
    token = str(value).strip()
    return re.sub(r"\s+", "_", token) if token else "SPEAKER_UNKNOWN"


def file_id(audio_path: str) -> str:
    return sanitize_rttm_token(Path(audio_path).stem or "audio")


def resolve_device(torch_module, requested: str):
    if requested == "auto":
        if torch_module.cuda.is_available():
            return torch_module.device("cuda")
        if hasattr(torch_module.backends, "mps") and torch_module.backends.mps.is_available():
            return torch_module.device("mps")
        return torch_module.device("cpu")

    return torch_module.device(requested)


def load_dependencies():
    try:
        import torch  # type: ignore
        from pyannote.audio import Pipeline  # type: ignore
        from pyannote.audio.pipelines.utils.hook import ProgressHook  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "Missing pyannote adapter dependency. Install pyannote.audio and torch in a local "
            f"environment before running this adapter. Import error: {exc}"
        ) from exc

    return torch, Pipeline, ProgressHook


def write_rttm(annotation, output_path: str, source_audio: str) -> None:
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    source_id = file_id(source_audio)

    with open(output_path, "w", encoding="utf-8") as handle:
        for segment, _track, speaker in annotation.itertracks(yield_label=True):
            start = float(segment.start)
            duration = max(0.0, float(segment.end) - start)
            if duration <= 0:
                continue
            handle.write(
                "SPEAKER "
                f"{source_id} 1 {start:.3f} {duration:.3f} <NA> <NA> "
                f"{sanitize_rttm_token(speaker)} <NA> <NA>\n"
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

    torch, Pipeline, ProgressHook = load_dependencies()
    token = args.hf_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    pipeline = Pipeline.from_pretrained(args.model, token=token)
    pipeline.to(resolve_device(torch, args.device))

    diarization_kwargs = {}
    if args.num_speakers is not None:
        diarization_kwargs["num_speakers"] = args.num_speakers
    else:
        if args.min_speakers is not None:
            diarization_kwargs["min_speakers"] = args.min_speakers
        if args.max_speakers is not None:
            diarization_kwargs["max_speakers"] = args.max_speakers

    with ProgressHook() as hook:
        result = pipeline(args.audio, hook=hook, **diarization_kwargs)

    annotation = getattr(result, "speaker_diarization", result)
    write_rttm(annotation, args.output, args.audio)
    write_stats(args.stats_output)


def check_model_access(args: argparse.Namespace) -> None:
    _torch, Pipeline, _ProgressHook = load_dependencies()
    token = args.hf_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")

    try:
        pipeline = Pipeline.from_pretrained(args.model, token=token)
    except Exception as exc:
        raise SystemExit(
            "Unable to load pyannote Community-1 model. Accept the model terms on Hugging Face "
            "and provide HF_TOKEN, HUGGINGFACE_TOKEN, or --hf-token. "
            f"Model: {args.model}. Error: {exc}"
        ) from exc

    if pipeline is None:
        raise SystemExit(
            "Unable to load pyannote Community-1 model. Pipeline.from_pretrained returned None. "
            "Accept the model terms on Hugging Face and provide HF_TOKEN, HUGGINGFACE_TOKEN, or --hf-token."
        )

    print(json.dumps({"ok": True, "adapter": "pyannote-community-1", "model": args.model}))


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if args.print_config_template:
        print(json.dumps(config_template(), indent=2))
        return 0

    if args.check_dependencies:
        load_dependencies()
        print(json.dumps({"ok": True, "adapter": "pyannote-community-1"}))
        return 0

    if args.check_model_access:
        check_model_access(args)
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
