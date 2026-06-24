#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function usage() {
  return [
    'Usage: node scripts/diarization-engine-availability.mjs --config config.json --output report.json',
    '',
    'Runs local command and file checks needed before a real diarization bakeoff.',
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

function resolveFromConfig(configPath, maybeRelativePath) {
  if (!maybeRelativePath || path.isAbsolute(maybeRelativePath)) {
    return maybeRelativePath;
  }

  return path.resolve(path.dirname(configPath), maybeRelativePath);
}

function tail(value) {
  const text = String(value ?? '');
  return text.length <= 2000 ? text : text.slice(-2000);
}

function runCommandCheck(configPath, check) {
  const cwd = resolveFromConfig(configPath, check.cwd) ?? path.dirname(configPath);
  const result = spawnSync(check.command, check.args ?? [], {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
  const exitCode = result.status ?? (result.error ? result.error.code : null);
  const status = result.status === 0 && !result.error ? 'pass' : 'fail';

  return {
    id: check.id,
    kind: 'command',
    required: check.required !== false,
    status,
    command: check.command,
    args: check.args ?? [],
    cwd,
    exitCode,
    signal: result.signal ?? null,
    error: result.error?.message,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
  };
}

function runFileCheck(configPath, check) {
  const filePath = resolveFromConfig(configPath, check.path);
  const exists = filePath ? fs.existsSync(filePath) : false;
  const stat = exists ? fs.statSync(filePath) : null;

  return {
    id: check.id,
    kind: 'file',
    required: check.required !== false,
    status: exists ? 'pass' : 'fail',
    path: filePath,
    exists,
    bytes: stat?.size,
  };
}

function runCheck(configPath, check) {
  if (!check.id) {
    throw new Error('Availability checks must include id.');
  }
  if (check.kind === 'command') {
    if (!check.command) {
      throw new Error(`Command check ${check.id} must include command.`);
    }
    return runCommandCheck(configPath, check);
  }
  if (check.kind === 'file') {
    if (!check.path) {
      throw new Error(`File check ${check.id} must include path.`);
    }
    return runFileCheck(configPath, check);
  }
  throw new Error(`Unsupported availability check kind for ${check.id}: ${check.kind}`);
}

function blockerFor(check) {
  if (!check.required || check.status === 'pass') {
    return null;
  }
  if (check.kind === 'command') {
    return `${check.id}:command_failed:${check.exitCode ?? 'unknown'}`;
  }
  if (check.kind === 'file') {
    return `${check.id}:file_missing`;
  }
  return `${check.id}:failed`;
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
  const checks = (config.checks ?? []).map((check) => runCheck(configPath, check));
  const blockers = checks.map(blockerFor).filter((blocker) => blocker !== null);
  const report = {
    generatedAt: args.generatedAt ?? config.generatedAt ?? new Date().toISOString(),
    ready: blockers.length === 0,
    blockers,
    checks,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    output: outputPath,
    ready: report.ready,
    blockers: report.blockers,
    checks: report.checks.map((check) => ({
      id: check.id,
      kind: check.kind,
      status: check.status,
      required: check.required,
    })),
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
