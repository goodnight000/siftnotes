#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bakeoffScriptPath = path.join(repoRoot, 'scripts', 'diarization-bakeoff.mjs');
const corpusReportScriptPath = path.join(repoRoot, 'scripts', 'diarization-corpus-report.mjs');

function usage() {
  return [
    'Usage: node scripts/diarization-real-corpus-run.mjs --index configs.index.json --report run.index.json [--corpus-report corpus.report.json]',
    '',
    'Runs per-recording bakeoff configs generated from the approved real-corpus manifest.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--index') {
      args.index = argv[index + 1];
      index += 1;
    } else if (arg === '--report') {
      args.report = argv[index + 1];
      index += 1;
    } else if (arg === '--corpus-report') {
      args.corpusReport = argv[index + 1];
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function tail(value) {
  const text = String(value ?? '');
  return text.length <= 4000 ? text : text.slice(-4000);
}

function runBakeoff(item) {
  const configPath = path.resolve(item.configPath);
  const outputReportPath = path.resolve(item.outputReportPath);
  const startedAt = process.hrtime.bigint();

  try {
    const stdout = execFileSync(process.execPath, [
      bakeoffScriptPath,
      '--config',
      configPath,
      '--output',
      outputReportPath,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const runtimeSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

    return {
      id: item.id,
      category: item.category,
      configPath,
      outputReportPath,
      status: 'success',
      runtimeSeconds,
      stdoutTail: tail(stdout),
      stderrTail: '',
    };
  } catch (error) {
    const runtimeSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

    return {
      id: item.id,
      category: item.category,
      configPath,
      outputReportPath,
      status: 'failure',
      runtimeSeconds,
      exitCode: error.status ?? null,
      signal: error.signal ?? null,
      stdoutTail: tail(error.stdout?.toString?.() ?? ''),
      stderrTail: tail(error.stderr?.toString?.() ?? error.message),
    };
  }
}

function requiredCategories(index) {
  if (!index.manifestPath) {
    return [];
  }

  const manifestPath = path.resolve(index.manifestPath);
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const manifest = readJson(manifestPath);
  return Array.isArray(manifest.requiredCategories) ? manifest.requiredCategories : [];
}

function buildCorpusReport({ index, reportPath, successReportPaths, generatedAt }) {
  if (!reportPath) {
    return {
      status: 'not_requested',
      path: null,
    };
  }
  if (successReportPaths.length === 0) {
    return {
      status: 'skipped_no_successful_reports',
      path: path.resolve(reportPath),
    };
  }

  const outputPath = path.resolve(reportPath);
  const categories = requiredCategories(index);
  const args = [
    corpusReportScriptPath,
    '--reports',
    ...successReportPaths,
    '--output',
    outputPath,
    '--generated-at',
    generatedAt,
  ];

  if (categories.length > 0) {
    args.push('--required-categories', categories.join(','));
  }

  const stdout = execFileSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  return {
    status: 'success',
    path: outputPath,
    stdoutTail: tail(stdout),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.index || !args.report) {
    throw new Error(`${usage()}\n\n--index and --report are required.`);
  }

  const indexPath = path.resolve(args.index);
  const reportPath = path.resolve(args.report);
  const index = readJson(indexPath);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const runs = (index.generated ?? []).map((item) => runBakeoff(item));
  const successReportPaths = runs
    .filter((run) => run.status === 'success')
    .map((run) => run.outputReportPath);
  const corpusReport = buildCorpusReport({
    index,
    reportPath: args.corpusReport,
    successReportPaths,
    generatedAt,
  });
  const report = {
    generatedAt,
    indexPath,
    summary: {
      generatedConfigCount: (index.generated ?? []).length,
      runCount: runs.length,
      successCount: runs.filter((run) => run.status === 'success').length,
      failureCount: runs.filter((run) => run.status === 'failure').length,
      skippedCount: (index.skipped ?? []).length,
    },
    runs,
    skipped: index.skipped ?? [],
    corpusReport,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    report: reportPath,
    summary: report.summary,
    corpusReport,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
