#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const frontendRequire = createRequire(path.join(repoRoot, 'frontend', 'package.json'));
const ts = frontendRequire('typescript');

function usage() {
  return [
    'Usage: node scripts/diarization-corpus-report.mjs --reports report-a.json report-b.json --required-categories clean-2-speaker,overlap-heavy --output corpus-report.json',
    '',
    'Aggregates per-recording diarization bakeoff reports into a corpus-level decision report.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    reports: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--reports') {
      index += 1;
      while (index < argv.length && !argv[index].startsWith('--')) {
        args.reports.push(argv[index]);
        index += 1;
      }
      index -= 1;
    } else if (arg === '--required-categories') {
      args.requiredCategories = argv[index + 1];
      index += 1;
    } else if (arg === '--output') {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === '--generated-at') {
      args.generatedAt = argv[index + 1];
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
  buildDiarizationCorpusReport,
} = loadTsModule(path.join(repoRoot, 'frontend', 'src', 'lib', 'diarization-evaluation.ts'));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseRequiredCategories(raw) {
  if (!raw) {
    return [
      'clean-2-speaker',
      '3-5-speaker-meeting',
      'noisy-poor-mic',
      'overlap-heavy',
      'system-audio-heavy',
      'similar-voices-backchannels',
    ];
  }

  return raw.split(',')
    .map((category) => category.trim())
    .filter((category) => category.length > 0);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.reports.length === 0 || !args.output) {
    throw new Error(`${usage()}\n\nAt least one --reports path and --output are required.`);
  }

  const outputPath = path.resolve(args.output);
  const reports = args.reports.map((reportPath) => readJson(path.resolve(reportPath)));
  const corpusReport = buildDiarizationCorpusReport({
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    requiredCategories: parseRequiredCategories(args.requiredCategories),
    reports,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(corpusReport, null, 2)}\n`);

  console.log(JSON.stringify({
    output: outputPath,
    decision: corpusReport.decision,
    candidates: corpusReport.candidates.map((candidate) => ({
      engine: candidate.engine,
      status: candidate.status,
      labeledItemCount: candidate.labeledItemCount,
      meanDer: candidate.meanDer,
      maxDer: candidate.maxDer,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
