import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-engine-availability.mjs');

test('diarization engine availability CLI records command and model blockers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-availability-'));
  const configPath = path.join(tmpDir, 'availability.config.json');
  const outputPath = path.join(tmpDir, 'availability.report.json');
  const modelPath = path.join(tmpDir, 'model.onnx');
  fs.writeFileSync(modelPath, 'fake model bytes');

  fs.writeFileSync(configPath, JSON.stringify({
    checks: [
      {
        id: 'command-ok',
        kind: 'command',
        command: process.execPath,
        args: ['-e', 'process.stdout.write("ok")'],
        required: true,
      },
      {
        id: 'command-fail',
        kind: 'command',
        command: process.execPath,
        args: ['-e', 'process.stderr.write("missing dep"); process.exit(2)'],
        required: true,
      },
      {
        id: 'model-present',
        kind: 'file',
        path: modelPath,
        required: true,
      },
      {
        id: 'optional-model-missing',
        kind: 'file',
        path: 'missing-optional.onnx',
        required: false,
      },
    ],
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--config',
    configPath,
    '--output',
    outputPath,
    '--generated-at',
    '2026-06-21T14:00:00.000Z',
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.generatedAt, '2026-06-21T14:00:00.000Z');
  assert.equal(report.ready, false);
  assert.deepEqual(report.blockers, [
    'command-fail:command_failed:2',
  ]);
  assert.deepEqual(report.checks.map((check) => ({
    id: check.id,
    kind: check.kind,
    required: check.required,
    status: check.status,
    exitCode: check.exitCode,
    exists: check.exists,
  })), [
    {
      id: 'command-ok',
      kind: 'command',
      required: true,
      status: 'pass',
      exitCode: 0,
      exists: undefined,
    },
    {
      id: 'command-fail',
      kind: 'command',
      required: true,
      status: 'fail',
      exitCode: 2,
      exists: undefined,
    },
    {
      id: 'model-present',
      kind: 'file',
      required: true,
      status: 'pass',
      exitCode: undefined,
      exists: true,
    },
    {
      id: 'optional-model-missing',
      kind: 'file',
      required: false,
      status: 'fail',
      exitCode: undefined,
      exists: false,
    },
  ]);
  assert.match(report.checks.find((check) => check.id === 'command-fail').stderrTail, /missing dep/);
});
