#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bakeoffScriptPath = path.join(repoRoot, 'scripts', 'diarization-bakeoff.mjs');

function usage() {
  return [
    'Usage: node scripts/diarization-sweep.mjs --config sweep.json --output sweep-report.json',
    '',
    'Runs parameterized diarization bakeoff variants from one base config.',
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveFromConfig(configPath, maybeRelativePath) {
  if (!maybeRelativePath || path.isAbsolute(maybeRelativePath)) {
    return maybeRelativePath;
  }

  return path.resolve(path.dirname(configPath), maybeRelativePath);
}

function replaceVariantPlaceholders(value, variant) {
  if (typeof value !== 'string') {
    return value;
  }

  let replaced = value.replaceAll('{variantId}', variant.id);
  for (const [key, paramValue] of Object.entries(variant.parameters ?? {})) {
    replaced = replaced.replaceAll(`{param.${key}}`, String(paramValue));
  }
  return replaced;
}

function renderVariantPlaceholders(value, variant) {
  if (Array.isArray(value)) {
    return value.map((entry) => renderVariantPlaceholders(entry, variant));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        renderVariantPlaceholders(entry, variant),
      ]),
    );
  }

  return replaceVariantPlaceholders(value, variant);
}

function deepMerge(base, patch) {
  if (patch === undefined) {
    return base;
  }
  if (
    base !== null &&
    patch !== null &&
    typeof base === 'object' &&
    typeof patch === 'object' &&
    !Array.isArray(base) &&
    !Array.isArray(patch)
  ) {
    return {
      ...base,
      ...Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [
          key,
          deepMerge(base[key], value),
        ]),
      ),
    };
  }

  return patch;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function absolutizeReadInputs(config, baseConfigPath) {
  const next = clone(config);
  if (next.corpusItem?.audioPath) {
    next.corpusItem.audioPath = resolveFromConfig(baseConfigPath, next.corpusItem.audioPath);
  }
  if (next.reference?.path) {
    next.reference.path = resolveFromConfig(baseConfigPath, next.reference.path);
  }
  if (next.transcripts?.path) {
    next.transcripts.path = resolveFromConfig(baseConfigPath, next.transcripts.path);
  }
  next.candidates = (next.candidates ?? []).map((candidate) => {
    const run = candidate.run
      ? {
        ...candidate.run,
        cwd: resolveFromConfig(baseConfigPath, candidate.run.cwd ?? '.'),
      }
      : undefined;

    return {
      ...candidate,
      ...(run ? { run } : {}),
      ...(Array.isArray(candidate.modelPaths)
        ? { modelPaths: candidate.modelPaths.map((modelPath) => resolveFromConfig(baseConfigPath, modelPath)) }
        : {}),
    };
  });
  return next;
}

function materializeVariantConfig(baseConfig, baseConfigPath, variant) {
  const absolutizedBaseConfig = absolutizeReadInputs(baseConfig, baseConfigPath);
  const matchingCandidates = absolutizedBaseConfig.candidates.filter((candidate) => candidate.engine === variant.candidate);
  if (matchingCandidates.length !== 1) {
    throw new Error(`Variant '${variant.id}' must match exactly one candidate named '${variant.candidate}'.`);
  }

  const baseCandidate = matchingCandidates[0];
  const patchedCandidate = deepMerge(baseCandidate, renderVariantPlaceholders(variant.patch ?? {}, variant));
  const renderedCandidate = resolveReadCandidatePath(
    renderVariantPlaceholders(patchedCandidate, variant),
    baseConfigPath,
  );
  const renderedConfig = renderVariantPlaceholders({
    ...absolutizedBaseConfig,
    candidates: [renderedCandidate],
  }, variant);

  return renderedConfig;
}

function resolveReadCandidatePath(candidate, baseConfigPath) {
  if (candidate.run || !candidate.path) {
    return candidate;
  }

  return {
    ...candidate,
    path: resolveFromConfig(baseConfigPath, candidate.path),
  };
}

function rankVariants(variants) {
  return [...variants].sort((a, b) => (
    gateRank(a.gate) - gateRank(b.gate) ||
    metricRank(a.der) - metricRank(b.der) ||
    metricRank(a.jer) - metricRank(b.jer) ||
    a.id.localeCompare(b.id)
  ));
}

function gateRank(gate) {
  if (gate === 'default_candidate') {
    return 0;
  }
  if (gate === 'optional_candidate') {
    return 1;
  }
  return 2;
}

function metricRank(value) {
  return typeof value === 'number' ? value : Number.POSITIVE_INFINITY;
}

function runVariant({
  baseConfig,
  baseConfigPath,
  outputDir,
  variant,
}) {
  const variantConfig = materializeVariantConfig(baseConfig, baseConfigPath, variant);
  const configPath = path.join(outputDir, 'configs', `${variant.id}.config.json`);
  const reportPath = path.join(outputDir, 'reports', `${variant.id}.report.json`);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(variantConfig, null, 2)}\n`);
  execFileSync(process.execPath, [
    bakeoffScriptPath,
    '--config',
    configPath,
    '--output',
    reportPath,
  ], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const report = readJson(reportPath);
  const candidate = report.candidates[0];
  return {
    id: variant.id,
    candidate: variant.candidate,
    engine: candidate.engine,
    parameters: variant.parameters ?? {},
    configPath,
    reportPath,
    der: candidate.metrics?.diarizationErrorRate ?? null,
    jer: candidate.metrics?.jaccardErrorRate ?? null,
    gate: candidate.gate.status,
    gateReasons: candidate.gate.reasons,
    practical: candidate.practical,
  };
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

  const sweepConfigPath = path.resolve(args.config);
  const outputPath = path.resolve(args.output);
  const sweepConfig = readJson(sweepConfigPath);
  const baseConfigPath = resolveFromConfig(sweepConfigPath, sweepConfig.baseConfig);
  if (!baseConfigPath) {
    throw new Error('Sweep config must include baseConfig.');
  }
  if (!Array.isArray(sweepConfig.variants) || sweepConfig.variants.length === 0) {
    throw new Error('Sweep config must include at least one variant.');
  }

  const baseConfig = readJson(baseConfigPath);
  const outputDir = resolveFromConfig(sweepConfigPath, sweepConfig.outputDir) ?? path.dirname(outputPath);
  const variants = sweepConfig.variants.map((variant) => runVariant({
    baseConfig,
    baseConfigPath,
    outputDir,
    variant,
  }));
  const rankedVariants = rankVariants(variants);
  const bestDefaultVariant = rankedVariants.find((variant) => variant.gate === 'default_candidate') ?? null;
  const bestOptionalVariant = rankedVariants.find((variant) => variant.gate === 'optional_candidate') ?? null;
  const sweepReport = {
    generatedAt: sweepConfig.generatedAt ?? new Date().toISOString(),
    baseConfig: baseConfigPath,
    outputDir,
    bestDefaultVariant,
    bestOptionalVariant,
    variants: rankedVariants,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(sweepReport, null, 2)}\n`);
  console.log(JSON.stringify({
    output: outputPath,
    bestDefaultVariant: bestDefaultVariant === null
      ? null
      : {
        id: bestDefaultVariant.id,
        engine: bestDefaultVariant.engine,
        der: bestDefaultVariant.der,
        jer: bestDefaultVariant.jer,
      },
    variantCount: rankedVariants.length,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
