#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const DEFAULT_GATES = {
  maxDefaultDer: 0.18,
  maxDefaultJer: 0.2,
  minDefaultRuntimeFactor: 1,
};

const SHERPA_SEGMENTATION_MODEL = path.join(
  repoRoot,
  'models',
  'sherpa-onnx-pyannote-segmentation-3-0',
  'model.onnx',
);
const SHERPA_EMBEDDING_MODEL = path.join(
  repoRoot,
  'models',
  '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
);
const PYANNOTE_MODEL_MIRROR = path.join(
  repoRoot,
  'models',
  'pyannote',
  'speaker-diarization-community-1',
);

function usage() {
  return [
    'Usage: node scripts/diarization-real-corpus-configs.mjs --manifest manifest.json --output-dir configs --report index.json [--include-pyannote]',
    '',
    'Materializes per-recording bakeoff configs from approved real-corpus manifest items.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    includePyannote: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      args.manifest = argv[index + 1];
      index += 1;
    } else if (arg === '--output-dir') {
      args.outputDir = argv[index + 1];
      index += 1;
    } else if (arg === '--report') {
      args.report = argv[index + 1];
      index += 1;
    } else if (arg === '--generated-at') {
      args.generatedAt = argv[index + 1];
      index += 1;
    } else if (arg === '--include-pyannote') {
      args.includePyannote = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sanitizeId(value) {
  return String(value).trim().replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function skipReason(item) {
  if (item.approvalStatus !== 'approved') {
    return `approval_${item.approvalStatus ?? 'missing'}`;
  }
  if (!item.audioPath) {
    return 'missing_audio_path';
  }
  return null;
}

function speakerHintArgs(item, engine) {
  const expected = item.expectedSpeakerCount;
  if (typeof expected === 'number' && Number.isFinite(expected) && expected > 0) {
    return ['--num-speakers', String(expected)];
  }

  if (engine === 'pyannote-community-1' && expected && typeof expected === 'object') {
    const args = [];
    if (Number.isFinite(expected.min) && expected.min > 0) {
      args.push('--min-speakers', String(expected.min));
    }
    if (Number.isFinite(expected.max) && expected.max > 0) {
      args.push('--max-speakers', String(expected.max));
    }
    return args;
  }

  return [];
}

function sherpaCandidate(item, outputDir) {
  return {
    engine: 'sherpa-onnx',
    engineVersion: 'offline-speaker-diarization',
    format: 'rttm',
    path: path.join(outputDir, 'sherpa-onnx.rttm'),
    modelPaths: [
      SHERPA_SEGMENTATION_MODEL,
      SHERPA_EMBEDDING_MODEL,
    ],
    run: {
      command: '.venv-diarization/bin/python',
      cwd: repoRoot,
      args: [
        'scripts/diarization-adapters/sherpa-onnx.py',
        '--audio',
        '{audioPath}',
        '--output',
        '{outputPath}',
        '--segmentation-model',
        SHERPA_SEGMENTATION_MODEL,
        '--embedding-model',
        SHERPA_EMBEDDING_MODEL,
        ...speakerHintArgs(item, 'sherpa-onnx'),
        '--cluster-threshold',
        '0.5',
        '--min-duration-on',
        '0.3',
        '--min-duration-off',
        '0.5',
        '--stats-output',
        '{statsPath}',
      ],
    },
    practical: {
      integration: 'native',
      localProcessing: true,
      licenseUse: 'app_default_ok',
      installComplexity: 'native_binary_with_models',
    },
  };
}

function pyannoteCandidate(item, outputDir) {
  return {
    engine: 'pyannote-community-1',
    engineVersion: 'pyannote/speaker-diarization-community-1',
    format: 'rttm',
    path: path.join(outputDir, 'pyannote-community-1.rttm'),
    modelPaths: [
      PYANNOTE_MODEL_MIRROR,
    ],
    run: {
      command: '.venv-diarization/bin/python',
      cwd: repoRoot,
      args: [
        'scripts/diarization-adapters/pyannote-community-1.py',
        '--audio',
        '{audioPath}',
        '--output',
        '{outputPath}',
        '--device',
        'auto',
        ...speakerHintArgs(item, 'pyannote-community-1'),
        '--stats-output',
        '{statsPath}',
      ],
    },
    practical: {
      integration: 'python-sidecar',
      localProcessing: true,
      licenseUse: 'gated_model_notice_required',
      installComplexity: 'python_sidecar_with_models',
    },
  };
}

function buildConfig(item, itemOutputDir, generatedAt, includePyannote) {
  const candidates = [
    sherpaCandidate(item, itemOutputDir),
  ];
  if (includePyannote) {
    candidates.push(pyannoteCandidate(item, itemOutputDir));
  }

  return {
    generatedAt,
    corpusItem: {
      id: item.id,
      category: item.category,
      audioPath: item.audioPath,
      ...(item.durationSeconds === undefined ? {} : { durationSeconds: item.durationSeconds }),
      ...(item.sampleRate === undefined ? {} : { sampleRate: item.sampleRate }),
    },
    gates: DEFAULT_GATES,
    ...(item.referenceRttmPath === undefined
      ? {}
      : {
        reference: {
          engine: 'human-rttm',
          format: 'rttm',
          path: item.referenceRttmPath,
        },
      }),
    ...(item.transcriptPath === undefined
      ? {}
      : {
        transcripts: {
          path: item.transcriptPath,
        },
      }),
    candidates,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.manifest || !args.outputDir || !args.report) {
    throw new Error(`${usage()}\n\n--manifest, --output-dir, and --report are required.`);
  }

  const manifestPath = path.resolve(args.manifest);
  const outputDir = path.resolve(args.outputDir);
  const reportPath = path.resolve(args.report);
  const manifest = readJson(manifestPath);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const generated = [];
  const skipped = [];

  for (const item of manifest.items ?? []) {
    const reason = skipReason(item);
    if (reason !== null) {
      skipped.push({
        id: item.id,
        category: item.category,
        reason,
      });
      continue;
    }

    const itemId = sanitizeId(item.id);
    const itemOutputDir = path.join(outputDir, itemId, 'outputs');
    const configPath = path.join(outputDir, itemId, 'config.json');
    const config = buildConfig(item, itemOutputDir, generatedAt, args.includePyannote);

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    generated.push({
      id: item.id,
      category: item.category,
      configPath,
      outputReportPath: path.join(outputDir, itemId, 'report.json'),
      candidateEngines: config.candidates.map((candidate) => candidate.engine),
      hasReference: item.referenceRttmPath !== undefined,
      hasTranscripts: item.transcriptPath !== undefined,
    });
  }

  const report = {
    generatedAt,
    manifestPath,
    outputDir,
    includePyannote: args.includePyannote,
    generated,
    skipped,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    report: reportPath,
    generatedCount: generated.length,
    skippedCount: skipped.length,
    generated: generated.map((item) => ({
      id: item.id,
      category: item.category,
      configPath: item.configPath,
      candidateEngines: item.candidateEngines,
    })),
    skipped,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
