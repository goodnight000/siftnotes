#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const frontendRequire = createRequire(path.join(repoRoot, 'frontend', 'package.json'));
const ts = frontendRequire('typescript');

function usage() {
  return [
    'Usage: node scripts/diarization-bakeoff.mjs --config config.json --output report.json',
    '',
    'Config supports local RTTM or JSON diarization files and local Meetily transcripts.json.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') {
      args.config = argv[index + 1];
      index += 1;
    } else if (arg === '--output') {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require: frontendRequire,
  });
  return module.exports;
}

const {
  buildDiarizationBakeoffReport,
  normalizeDiarizationOutput,
  parseRttm,
} = loadTsModule(path.join(repoRoot, 'frontend', 'src', 'lib', 'diarization-evaluation.ts'));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function roundPracticalMetric(value) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function resolveFromConfig(configPath, maybeRelativePath) {
  if (!maybeRelativePath || path.isAbsolute(maybeRelativePath)) {
    return maybeRelativePath;
  }

  return path.resolve(path.dirname(configPath), maybeRelativePath);
}

function replacePlaceholders(value, replacements) {
  return value
    .replaceAll('{audioPath}', replacements.audioPath ?? '')
    .replaceAll('{outputPath}', replacements.outputPath ?? '')
    .replaceAll('{statsPath}', replacements.statsPath ?? '')
    .replaceAll('{engine}', replacements.engine ?? '');
}

function runCandidateAdapter(configPath, entry, outputPath, fallbackAudio) {
  if (!entry.run) {
    return null;
  }
  if (!entry.run.command) {
    throw new Error(`Run adapter for ${entry.engine} must include command.`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const statsPath = resolveFromConfig(configPath, entry.run.statsPath) ?? `${outputPath}.stats.json`;

  const replacements = {
    audioPath: fallbackAudio.path,
    outputPath,
    statsPath,
    engine: entry.engine,
  };
  const command = replacePlaceholders(entry.run.command, replacements);
  const args = (entry.run.args ?? []).map((arg) => replacePlaceholders(arg, replacements));
  const cwd = resolveFromConfig(configPath, entry.run.cwd) ?? path.dirname(configPath);

  const startedAt = process.hrtime.bigint();
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
  const runtimeSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  const adapterStats = fs.existsSync(statsPath) ? readJson(statsPath) : {};

  return { ...adapterStats, runtimeSeconds };
}

function mergeAudioMetadata(rawAudio, fallbackAudio) {
  return {
    ...fallbackAudio,
    ...(rawAudio ?? {}),
  };
}

function loadDiarizationFile(configPath, entry, fallbackAudio) {
  const entryPath = resolveFromConfig(configPath, entry.path);
  if (!entryPath) {
    throw new Error(`Missing path for diarization entry: ${entry.engine}`);
  }

  const runStats = runCandidateAdapter(configPath, entry, entryPath, fallbackAudio);

  if (entry.format === 'rttm') {
    return {
      output: parseRttm({
        engine: entry.engine,
        engineVersion: entry.engineVersion,
        audioPath: fallbackAudio.path,
        durationSeconds: fallbackAudio.durationSeconds,
        sampleRate: entry.sampleRate,
        text: fs.readFileSync(entryPath, 'utf8'),
      }),
      runStats,
    };
  }

  if (entry.format === 'json') {
    const raw = readJson(entryPath);
    return {
      output: normalizeDiarizationOutput(Array.isArray(raw)
        ? {
          engine: entry.engine,
          engineVersion: entry.engineVersion,
          audio: fallbackAudio,
          turns: raw,
        }
        : {
          ...raw,
          engine: raw.engine ?? entry.engine,
          engineVersion: raw.engineVersion ?? entry.engineVersion,
          audio: mergeAudioMetadata(raw.audio, fallbackAudio),
        }),
      runStats,
    };
  }

  throw new Error(`Unsupported diarization format '${entry.format}' for ${entry.engine}`);
}

function measureModelSizeMb(configPath, modelPaths) {
  if (!Array.isArray(modelPaths) || modelPaths.length === 0) {
    return undefined;
  }

  const totalBytes = modelPaths.reduce((total, modelPath) => {
    const resolvedModelPath = resolveFromConfig(configPath, modelPath);
    if (!resolvedModelPath) {
      return total;
    }

    return total + fs.statSync(resolvedModelPath).size;
  }, 0);

  return roundPracticalMetric(totalBytes / (1024 * 1024));
}

const PRACTICAL_STATS_KEYS = [
  'adapterRuntimeSeconds',
  'peakMemoryMb',
  'modelSizeMb',
];

function enrichPracticalMetadata(configPath, entry, runStats, audioDurationSeconds) {
  const practical = entry.practical;
  const enriched = { ...practical };
  const measuredModelSizeMb = measureModelSizeMb(configPath, entry.modelPaths);

  for (const key of PRACTICAL_STATS_KEYS) {
    if (runStats?.[key] !== undefined) {
      enriched[key] = runStats[key];
    }
  }

  if (measuredModelSizeMb !== undefined) {
    enriched.modelSizeMb = measuredModelSizeMb;
  }

  if (runStats?.runtimeSeconds !== undefined) {
    enriched.runtimeSeconds = runStats.runtimeSeconds;

    if (
      audioDurationSeconds !== undefined &&
      Number.isFinite(audioDurationSeconds) &&
      audioDurationSeconds > 0 &&
      runStats.runtimeSeconds > 0
    ) {
      enriched.runtimeFactor = audioDurationSeconds / runStats.runtimeSeconds;
    }
  }

  return enriched;
}

function loadTranscriptSegments(configPath, transcriptsConfig) {
  if (!transcriptsConfig?.path) {
    return [];
  }

  const transcriptPath = resolveFromConfig(configPath, transcriptsConfig.path);
  const raw = readJson(transcriptPath);
  if (Array.isArray(raw)) {
    return raw;
  }
  if (Array.isArray(raw.transcripts)) {
    return raw.transcripts;
  }

  throw new Error(`Transcript file must be an array or an object with transcripts[]: ${transcriptPath}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.config || !args.output) {
    throw new Error(`${usage()}\n\nBoth --config and --output are required.`);
  }

  const configPath = path.resolve(args.config);
  const outputPath = path.resolve(args.output);
  const config = readJson(configPath);
  const audioPath = config.corpusItem?.audioPath;
  const resolvedAudioPath = resolveFromConfig(configPath, audioPath);
  const fallbackAudio = {
    path: resolvedAudioPath,
    ...(config.corpusItem?.durationSeconds === undefined ? {} : { durationSeconds: config.corpusItem.durationSeconds }),
    ...(config.corpusItem?.sampleRate === undefined ? {} : { sampleRate: config.corpusItem.sampleRate }),
  };

  if (!config.corpusItem?.id || !config.corpusItem?.category || !audioPath) {
    throw new Error('Config corpusItem must include id, category, and audioPath.');
  }
  if (!Array.isArray(config.candidates) || config.candidates.length === 0) {
    throw new Error('Config must include at least one candidate.');
  }

  const report = buildDiarizationBakeoffReport({
    generatedAt: config.generatedAt ?? new Date().toISOString(),
    corpusItem: config.corpusItem,
    gates: config.gates ?? {
      maxDefaultDer: 0.18,
      maxDefaultJer: 0.2,
      minDefaultRuntimeFactor: 1,
    },
    reference: config.reference
      ? loadDiarizationFile(configPath, config.reference, fallbackAudio).output
      : null,
    transcriptSegments: loadTranscriptSegments(configPath, config.transcripts),
    candidates: config.candidates.map((candidate) => {
      const loaded = loadDiarizationFile(configPath, candidate, fallbackAudio);
      return {
        output: loaded.output,
        practical: enrichPracticalMetadata(configPath, candidate, loaded.runStats, fallbackAudio.durationSeconds),
      };
    }),
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    output: outputPath,
    decision: report.decision,
    candidates: report.candidates.map((candidate) => ({
      engine: candidate.engine,
      der: candidate.metrics?.diarizationErrorRate ?? null,
      jer: candidate.metrics?.jaccardErrorRate ?? null,
      gate: candidate.gate.status,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
