import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-real-corpus-run.mjs');

test('real corpus run CLI executes generated configs and aggregates successful reports', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-real-run-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const configPath = path.join(tmpDir, 'clean.config.json');
  const outputReportPath = path.join(tmpDir, 'clean.report.json');
  const runReportPath = path.join(tmpDir, 'run.index.json');
  const corpusReportPath = path.join(tmpDir, 'corpus.report.json');
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const candidatePath = path.join(tmpDir, 'sherpa.rttm');
  const indexPath = path.join(tmpDir, 'configs.index.json');

  fs.writeFileSync(manifestPath, JSON.stringify({
    requiredCategories: ['clean-2-speaker'],
    items: [],
  }, null, 2));
  fs.writeFileSync(referencePath, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\n');
  fs.writeFileSync(candidatePath, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\n');
  fs.writeFileSync(configPath, JSON.stringify({
    generatedAt: '2026-06-21T16:00:00.000Z',
    corpusItem: {
      id: 'clean-call-001',
      category: 'clean-2-speaker',
      audioPath: '/tmp/clean.wav',
      durationSeconds: 2,
    },
    reference: {
      engine: 'human-rttm',
      format: 'rttm',
      path: referencePath,
    },
    candidates: [
      {
        engine: 'sherpa-onnx',
        format: 'rttm',
        path: candidatePath,
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2,
        },
      },
    ],
  }, null, 2));
  fs.writeFileSync(indexPath, JSON.stringify({
    generatedAt: '2026-06-21T16:00:00.000Z',
    manifestPath,
    generated: [
      {
        id: 'clean-call-001',
        category: 'clean-2-speaker',
        configPath,
        outputReportPath,
        candidateEngines: ['sherpa-onnx'],
      },
    ],
    skipped: [
      {
        id: 'overlap-slot',
        category: 'overlap-heavy',
        reason: 'approval_not_requested',
      },
    ],
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--index',
    indexPath,
    '--report',
    runReportPath,
    '--corpus-report',
    corpusReportPath,
    '--generated-at',
    '2026-06-21T16:30:00.000Z',
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const runReport = JSON.parse(fs.readFileSync(runReportPath, 'utf8'));
  assert.equal(runReport.generatedAt, '2026-06-21T16:30:00.000Z');
  assert.deepEqual(runReport.summary, {
    generatedConfigCount: 1,
    runCount: 1,
    successCount: 1,
    failureCount: 0,
    skippedCount: 1,
  });
  assert.equal(runReport.runs[0].status, 'success');
  assert.equal(runReport.runs[0].outputReportPath, outputReportPath);

  const corpusReport = JSON.parse(fs.readFileSync(corpusReportPath, 'utf8'));
  assert.equal(corpusReport.decision.defaultCandidate, 'sherpa-onnx');
  assert.equal(corpusReport.candidates[0].meanDer, 0);
});
