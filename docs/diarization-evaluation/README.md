# Full Diarization Evaluation Track

This track evaluates speaker diarization engines before any Meetily UI integration.
It keeps the app local-first and post-recording-first while preserving overlap
metadata separately from flattened transcript display labels.

## Paused As Of 2026-06-22

Full diarization evaluation is paused by product decision. Do not run pyannote
locally, do not switch to a paid/cloud diarization oracle, and do not integrate
full diarization into the app UI from the current evidence.

Resume only if there is explicit approval for a cloud/remote-GPU oracle on
specific non-sensitive or approved recordings, a better local/native candidate
becomes available, or product accepts best-effort local diarization despite the
current overlap-heavy failure.

## Current Decision Rule

Use `pyannote-community-1` as the high-quality offline reference and
`sherpa-onnx` as the Rust/Tauri product candidate. A native engine can become
the default only if it passes the same corpus and gates as the reference path.

Default gates:

| Gate | Threshold |
| --- | --- |
| DER | `<= 0.18` |
| JER | `<= 0.20` |
| Runtime factor | `>= 1.0` |
| Processing | local only |
| Integration | native for default, sidecar allowed only as optional |
| License | app-default-safe for default |

## Common Output Contract

Each engine is normalized to:

```json
{
  "engine": "sherpa-onnx",
  "engineVersion": "optional",
  "audio": {
    "path": "meeting.wav",
    "durationSeconds": 3600,
    "sampleRate": 16000
  },
  "turns": [
    {
      "start": 12.34,
      "end": 15.67,
      "speaker": "SPEAKER_00",
      "confidence": 0.91,
      "overlap": false
    }
  ],
  "rejectedTurns": []
}
```

Transcript assignment is separate:

```json
{
  "speaker": "SPEAKER_00",
  "coverageRatio": 0.87,
  "coverageSeconds": 2.6,
  "overlappedSpeakers": ["SPEAKER_00", "SPEAKER_01"],
  "overlapSeconds": 0.4,
  "assignmentReason": "dominant_overlap"
}
```

## Harness Commands

Run the evaluator tests:

```bash
node frontend/tests/lib/diarization-evaluation.test.mjs
node frontend/tests/lib/diarization-bakeoff-cli.test.mjs
node frontend/tests/lib/diarization-corpus-cli.test.mjs
node frontend/tests/lib/diarization-corpus-manifest-cli.test.mjs
node frontend/tests/lib/diarization-engine-availability-cli.test.mjs
node frontend/tests/lib/diarization-real-corpus-config-cli.test.mjs
node frontend/tests/lib/diarization-real-corpus-run-cli.test.mjs
node frontend/tests/lib/diarization-sweep-cli.test.mjs
node frontend/tests/lib/diarization-ami-public-corpus-cli.test.mjs
node frontend/tests/lib/diarization-adapter-scripts.test.mjs
node frontend/tests/lib/diarization-separated-channel-adapter.test.mjs
```

Install the local evaluation runtimes in an isolated venv:

```bash
python3 -m venv .venv-diarization
.venv-diarization/bin/python -m pip install --upgrade pip setuptools wheel
.venv-diarization/bin/python -m pip install torch pyannote.audio sherpa-onnx numpy soundfile scipy huggingface_hub
```

Download the sherpa local models:

```bash
mkdir -p models
curl -L -o /tmp/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2 \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2
tar -xjf /tmp/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2 -C models
curl -L -o models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx \
  https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx
```

Run the synthetic dry-run fixture:

```bash
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/synthetic-overlap.config.json \
  --output docs/diarization-evaluation/reports/synthetic-overlap.report.json
```

Run the synthetic unlabeled fixture:

```bash
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/synthetic-unlabeled.config.json \
  --output docs/diarization-evaluation/reports/synthetic-unlabeled.report.json
```

Run the public sherpa runtime smoke fixture:

```bash
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/public-sherpa-four-speakers.config.json \
  --output docs/diarization-evaluation/reports/public-sherpa-four-speakers.report.json
```

This fixture uses the official public sherpa sample audio. It proves the native
sherpa adapter can run locally through the harness, but it has no human RTTM
reference and therefore cannot support an app-default decision by itself.

Aggregate per-recording reports into a corpus-level decision report:

```bash
node scripts/diarization-corpus-report.mjs \
  --reports \
    docs/diarization-evaluation/reports/synthetic-overlap.report.json \
    docs/diarization-evaluation/reports/synthetic-unlabeled.report.json \
  --required-categories clean-2-speaker,3-5-speaker-meeting,noisy-poor-mic,overlap-heavy,system-audio-heavy,similar-voices-backchannels \
  --output docs/diarization-evaluation/reports/synthetic-corpus.report.json
```

The corpus report refuses a default recommendation unless required categories
are covered by labeled reports. It also summarizes each engine's mean/max
DER/JER, pass/fail counts, runtime factor, model size, and peak memory where
available.

Summarize the real-corpus intake manifest before running private recordings:

```bash
node scripts/diarization-corpus-manifest.mjs \
  --manifest docs/diarization-evaluation/fixtures/real-corpus.manifest.json \
  --output docs/diarization-evaluation/reports/real-corpus-manifest.report.json
```

The manifest report separates three readiness states: approved local audio for
unlabeled trials, labeled references for an engine decision, and approved
Meetily transcripts for transcript reconciliation. The checked-in manifest uses
placeholder slots only; replace a slot with a specific approved local file path
before running engines on user recordings.

Materialize per-recording bakeoff configs for approved manifest items:

```bash
node scripts/diarization-real-corpus-configs.mjs \
  --manifest docs/diarization-evaluation/fixtures/real-corpus.manifest.json \
  --output-dir docs/diarization-evaluation/reports/real-corpus-configs \
  --report docs/diarization-evaluation/reports/real-corpus-configs.index.json \
  --include-pyannote
```

The generator refuses unapproved manifest entries and records skip reasons in
the index report. It does not read private audio or transcript contents; it only
turns approved manifest metadata into reproducible bakeoff configs.

Run all approved real-corpus configs and optionally aggregate successful reports:

```bash
node scripts/diarization-real-corpus-run.mjs \
  --index docs/diarization-evaluation/reports/real-corpus-configs.index.json \
  --report docs/diarization-evaluation/reports/real-corpus-run.index.json \
  --corpus-report docs/diarization-evaluation/reports/real-corpus.report.json
```

The runner executes only configs already generated from approved manifest items.
When the index has no generated configs, it writes a skipped run report and does
not create a corpus decision.

Probe local engine dependencies and model files:

```bash
node scripts/diarization-engine-availability.mjs \
  --config docs/diarization-evaluation/fixtures/engine-availability.config.json \
  --output docs/diarization-evaluation/reports/engine-availability.report.json
```

The availability report is the reproducible source for runtime blockers. It
checks pyannote and sherpa adapter dependencies, required local model paths, and
the optional `sherpa-onnx` command. A real bakeoff should not be treated as
runnable until required checks pass.

As of the current local setup, sherpa dependencies and models pass. The
remaining runtime blocker is pyannote Community-1 model access. Provide an
accepted Hugging Face token through `HF_TOKEN`, `HUGGINGFACE_TOKEN`, or the
adapter's `--hf-token` flag before running pyannote.

Run a reproducible parameter sweep:

```bash
node scripts/diarization-sweep.mjs \
  --config docs/diarization-evaluation/fixtures/synthetic-overlap.sweep.config.json \
  --output docs/diarization-evaluation/reports/synthetic-sweep.report.json
```

Sweep configs start from one base bakeoff config and materialize variants with
`{variantId}` and `{param.name}` placeholders. This is the path for iterating
sherpa `cluster-threshold`, `min-duration-on/off`, and pyannote
`num/min/max-speakers` hints while keeping exact configs and reports per
variant.

## Public AMI Labeled Smoke

AMI provides public meeting audio streams and manual annotations under CC BY
4.0. Use it as a non-private labeled check while Meetily recordings still need
file-specific approval.

Prepare the public AMI labeled clips:

```bash
mkdir -p /tmp/meetily-ami-probe \
  docs/diarization-evaluation/public-data/ami/ES2002a \
  docs/diarization-evaluation/public-data/ami/IS1008a
curl -L -o /tmp/meetily-ami-probe/ami_public_manual_1.6.2.zip \
  https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip
curl -L -o docs/diarization-evaluation/public-data/ami/ES2002a/ES2002a.Mix-Headset.wav \
  https://groups.inf.ed.ac.uk/ami/AMICorpusMirror//amicorpus/ES2002a/audio/ES2002a.Mix-Headset.wav
curl -L -o docs/diarization-evaluation/public-data/ami/IS1008a/IS1008a.Mix-Headset.wav \
  https://groups.inf.ed.ac.uk/ami/AMICorpusMirror//amicorpus/IS1008a/audio/IS1008a.Mix-Headset.wav
for channel in 0 1 2 3; do \
  curl -L -o "docs/diarization-evaluation/public-data/ami/ES2002a/ES2002a.Headset-${channel}.wav" \
    "https://groups.inf.ed.ac.uk/ami/AMICorpusMirror//amicorpus/ES2002a/audio/ES2002a.Headset-${channel}.wav"; \
done
ffmpeg -y -hide_banner -loglevel error \
  -ss 270 -t 120 \
  -i docs/diarization-evaluation/public-data/ami/ES2002a/ES2002a.Mix-Headset.wav \
  -ac 1 -ar 16000 \
  docs/diarization-evaluation/public-data/ami/ES2002a/ES2002a.270-390.Mix-Headset.16k.wav
ffmpeg -y -hide_banner -loglevel error \
  -ss 390 -t 120 \
  -i docs/diarization-evaluation/public-data/ami/IS1008a/IS1008a.Mix-Headset.wav \
  -ac 1 -ar 16000 \
  docs/diarization-evaluation/public-data/ami/IS1008a/IS1008a.390-510.Mix-Headset.16k.wav
ffmpeg -y -hide_banner -loglevel error \
  -i docs/diarization-evaluation/public-data/ami/IS1008a/IS1008a.390-510.Mix-Headset.16k.wav \
  -filter_complex "[0:a]volume=0.65,lowpass=f=3400[a0];anoisesrc=color=white:amplitude=0.018:d=120[a1];[a0][a1]amix=inputs=2:duration=first:normalize=0[out]" \
  -map "[out]" -ac 1 -ar 16000 \
  docs/diarization-evaluation/public-data/ami/IS1008a/IS1008a.390-510.Mix-Headset.16k.noisy.wav
for channel in 0 1 2 3; do \
  ffmpeg -y -hide_banner -loglevel error \
    -ss 270 -t 120 \
    -i "docs/diarization-evaluation/public-data/ami/ES2002a/ES2002a.Headset-${channel}.wav" \
    -ac 1 -ar 16000 \
    "docs/diarization-evaluation/public-data/ami/ES2002a/ES2002a.Headset-${channel}.270-390.16k.wav"; \
done
python3 scripts/diarization-public-corpora/ami-nxt-to-fixtures.py \
  --meeting-id ES2002a \
  --annotations-zip /tmp/meetily-ami-probe/ami_public_manual_1.6.2.zip \
  --clip-start-seconds 270 \
  --clip-end-seconds 390 \
  --output-rttm docs/diarization-evaluation/fixtures/public-ami-es2002a-270-390.reference.rttm \
  --output-transcripts docs/diarization-evaluation/fixtures/public-ami-es2002a-270-390.transcripts.json
python3 scripts/diarization-public-corpora/ami-nxt-to-fixtures.py \
  --meeting-id IS1008a \
  --annotations-zip /tmp/meetily-ami-probe/ami_public_manual_1.6.2.zip \
  --clip-start-seconds 390 \
  --clip-end-seconds 510 \
  --output-rttm docs/diarization-evaluation/fixtures/public-ami-is1008a-390-510.reference.rttm \
  --output-transcripts docs/diarization-evaluation/fixtures/public-ami-is1008a-390-510.transcripts.json
```

Run the labeled public bakeoff and sweep:

```bash
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/public-ami-is1008a-390-510-clean.config.json \
  --output docs/diarization-evaluation/reports/public-ami-is1008a-390-510-clean.report.json
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/public-ami-is1008a-390-510-noisy.config.json \
  --output docs/diarization-evaluation/reports/public-ami-is1008a-390-510-noisy.report.json
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/public-ami-es2002a-270-390.config.json \
  --output docs/diarization-evaluation/reports/public-ami-es2002a-270-390.report.json
node scripts/diarization-sweep.mjs \
  --config docs/diarization-evaluation/fixtures/public-ami-es2002a-270-390.sweep.config.json \
  --output docs/diarization-evaluation/reports/public-ami-es2002a-270-390-sweep.report.json
node scripts/diarization-sweep.mjs \
  --config docs/diarization-evaluation/fixtures/public-ami-es2002a-270-390-duration.sweep.config.json \
  --output docs/diarization-evaluation/reports/public-ami-es2002a-270-390-duration-sweep.report.json
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/public-ami-es2002a-270-390-tuned.config.json \
  --output docs/diarization-evaluation/reports/public-ami-es2002a-270-390-tuned.report.json
node scripts/diarization-bakeoff.mjs \
  --config docs/diarization-evaluation/fixtures/public-ami-es2002a-270-390-separated-energy.config.json \
  --output docs/diarization-evaluation/reports/public-ami-es2002a-270-390-separated-energy.report.json
node scripts/diarization-corpus-report.mjs \
  --reports \
    docs/diarization-evaluation/reports/public-ami-is1008a-390-510-clean.report.json \
    docs/diarization-evaluation/reports/public-ami-is1008a-390-510-noisy.report.json \
    docs/diarization-evaluation/reports/public-ami-es2002a-270-390-tuned.report.json \
  --required-categories public-ami-clean-2-speaker,public-ami-noisy-2-speaker,public-ami-4-speaker-overlap \
  --output docs/diarization-evaluation/reports/public-ami-corpus.report.json
```

Current public AMI result: sherpa-onnx passes clean and noisy 2-speaker clips
with DER `0.082929` and `0.091133`, but fails the 4-speaker overlap-heavy clip
even after tuning, with best DER `0.388921` and JER `0.521543`. The 3-item
public AMI corpus therefore does not support sherpa as an app default yet.

The separated ES2002a headset tracks are also a useful negative check. AMI
metadata maps channels 0/1/2/3 to agents A/B/C/D for this meeting, but naive
per-channel energy diarization still fails with DER `0.492994` and JER
`0.474808`. This rules out a simple "separate tracks plus RMS gate" approach
for overlap handling.

Candidate entries can either point at an existing RTTM/JSON output or run a
local adapter first:

```json
{
  "engine": "sherpa-onnx",
  "format": "rttm",
  "path": "outputs/sherpa.rttm",
  "modelPaths": [
    "models/sherpa-onnx-pyannote-segmentation-3-0/model.onnx",
    "models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
  ],
  "run": {
    "command": "python3",
    "args": [
      "scripts/local-sherpa-adapter.py",
      "--audio",
      "{audioPath}",
      "--output",
      "{outputPath}",
      "--stats-output",
      "{statsPath}"
    ]
  },
  "practical": {
    "integration": "native",
    "localProcessing": true,
    "licenseUse": "app_default_ok",
    "runtimeFactor": 1.0
  }
}
```

Supported placeholders are `{audioPath}`, `{outputPath}`, `{statsPath}`, and
`{engine}`. The command is executed directly without a shell.
When a candidate uses `run`, the CLI records wall-clock `runtimeSeconds` and,
when `corpusItem.durationSeconds` is present, derives `runtimeFactor` as
`audio_duration / runtime_seconds`.
When a candidate includes `modelPaths`, the CLI resolves them relative to the
config file and writes measured `modelSizeMb` into the candidate practical
metadata.
Adapters can write JSON to `{statsPath}`. The CLI currently merges
`peakMemoryMb`, `adapterRuntimeSeconds`, and `modelSizeMb` from that sidecar
into practical metadata. The bundled pyannote and sherpa adapters write
`peakMemoryMb` after successful inference.

`reference` is optional. When it is missing, the report sets candidate
`metrics` to `null`, computes practical metrics, and fails the default gate with
`missing_reference_labels`. This lets us triage real local recordings before a
human RTTM exists, without claiming a best engine.

Each candidate also receives practical metrics derived from the normalized
turns:

| Metric | Purpose |
| --- | --- |
| `speakerCount` | Sanity check against known or expected meeting size |
| `turnCount` and `turnsPerMinute` | Detect over-segmentation and short-turn churn |
| `speechSeconds` and `speakerSeconds` | Detect sparse or inflated speech assignment |
| `overlapRegionSeconds` and `overlapSpeakerSeconds` | Track overlap detection behavior |
| `overlapRatio` | Compare crosstalk sensitivity across recordings |
| `rejectedTurnCount` | Catch invalid adapter output |

Each candidate also receives transcript reconciliation metrics derived from
Meetily transcript segment timestamps:

| Metric | Purpose |
| --- | --- |
| `assignedSegments` and `unassignedSegments` | Detect how many transcript segments get a speaker |
| `missingTimingSegments` | Catch legacy or malformed transcript rows without audio-relative timing |
| `noOverlapSegments` | Catch diarization outputs that miss transcript speech entirely |
| `lowCoverageAssignedSegments` | Flag speaker labels based on less than 50% segment coverage |
| `overlapSegmentCount` and `tieSegmentCount` | Track overlap-preserving transcript assignments |
| `meanCoverageRatio` | Compare transcript reconciliation quality across variants |

Candidate `practical` metadata carries measured or supplied app-readiness data:
`runtimeSeconds`, `adapterRuntimeSeconds`, `runtimeFactor`, `peakMemoryMb`,
`modelSizeMb`, and `installComplexity`.

## Local Engine Adapters

The harness includes dependency-light adapter entrypoints:

```bash
python3 scripts/diarization-adapters/pyannote-community-1.py --print-config-template
python3 scripts/diarization-adapters/sherpa-onnx.py --print-config-template
python3 scripts/diarization-adapters/separated-channel-energy.py --check-dependencies
```

`pyannote-community-1.py` uses `pyannote/speaker-diarization-community-1`,
preserves overlap with `speaker_diarization`, and writes RTTM. It requires local
Python dependencies plus accepted Hugging Face model access.

`sherpa-onnx.py` uses sherpa-onnx offline speaker diarization with explicit
segmentation and embedding model paths, clustering threshold, and
`min_duration_on/off` knobs. It writes RTTM for the same evaluator.

`separated-channel-energy.py` is an evaluation-only negative-control adapter
for local WAV channels that are already separated by speaker. It is not an app
candidate; it documents that simple channel energy is insufficient on
overlap-heavy AMI headset audio.

## Real Corpus Plan

The real bakeoff needs approved local recordings. Do not upload recordings.
Use 10-20 files across:

| Category | Purpose |
| --- | --- |
| Clean 2-speaker call | Baseline speaker count and turn stability |
| 3-5 speaker meeting | Meeting-like speaker count |
| Noisy or poor mic audio | Missed-speech and boundary stress |
| Overlap-heavy segment | Crosstalk and interruption stress |
| System-audio-heavy call | Mixed mic/system stress |
| Similar voices or backchannels | Speaker confusion and short-turn stress |

Required per item:

- local audio path
- optional Meetily `transcripts.json`
- optional human RTTM reference
- known or bounded speaker count when available
- notes about mic/system separation availability
- explicit `approvalStatus` for that local recording

## Engine Output Collection

`pyannote-community-1` should produce RTTM or the common JSON schema. It remains
the quality oracle and optional high-accuracy sidecar candidate because it uses a
Python/PyTorch stack and gated model terms.

`sherpa-onnx` should produce RTTM or the common JSON schema. It is the default
candidate only if it matches quality gates on real Meetily audio and remains
native/local/license-safe.

## Current Blocker

The goal is paused, not blocked on harness mechanics or sherpa runtime setup.
Sherpa dependencies and local model files are available and public AMI evidence
has been generated.

Remaining blockers:

- pyannote Community-1 needs accepted Hugging Face gated-model access through
  `HF_TOKEN`, `HUGGINGFACE_TOKEN`, `--hf-token`, or a local mirror at
  `models/pyannote/speaker-diarization-community-1`.
- Real Meetily recordings still need file-specific approval before the harness
  can read them.
- Real decision-quality DER/JER needs hand RTTM labels for each approved
  category.

Until those are resolved, do not integrate a diarization engine into the app UI.
