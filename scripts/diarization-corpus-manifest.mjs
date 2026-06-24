#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const frontendRequire = createRequire(path.join(repoRoot, 'frontend', 'package.json'));
const ts = frontendRequire('typescript');

const DEFAULT_REQUIRED_CATEGORIES = [
  'clean-2-speaker',
  '3-5-speaker-meeting',
  'noisy-poor-mic',
  'overlap-heavy',
  'system-audio-heavy',
  'similar-voices-backchannels',
];

function usage() {
  return [
    'Usage: node scripts/diarization-corpus-manifest.mjs --manifest manifest.json --output manifest.report.json',
    '',
    'Summarizes approved local recordings, labels, and transcript readiness before running a real diarization bakeoff.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') {
      args.manifest = argv[index + 1];
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
  buildDiarizationCorpusManifestReport,
} = loadTsModule(path.join(repoRoot, 'frontend', 'src', 'lib', 'diarization-evaluation.ts'));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.manifest || !args.output) {
    throw new Error(`${usage()}\n\nBoth --manifest and --output are required.`);
  }

  const manifest = readJson(path.resolve(args.manifest));
  const outputPath = path.resolve(args.output);
  const report = buildDiarizationCorpusManifestReport({
    requiredCategories: manifest.requiredCategories ?? DEFAULT_REQUIRED_CATEGORIES,
    items: manifest.items ?? [],
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    output: outputPath,
    readiness: report.readiness,
    categoryCoverage: report.categoryCoverage.map((coverage) => ({
      category: coverage.category,
      status: coverage.status,
      approvedItemCount: coverage.approvedItemIds.length,
      labeledItemCount: coverage.labeledItemIds.length,
      transcriptItemCount: coverage.transcriptItemIds.length,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
