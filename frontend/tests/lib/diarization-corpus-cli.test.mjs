import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-corpus-report.mjs');

test('diarization corpus CLI aggregates per-recording reports into a decision report', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-corpus-'));
  const reportAPath = path.join(tmpDir, 'clean.report.json');
  const reportBPath = path.join(tmpDir, 'overlap.report.json');
  const outputPath = path.join(tmpDir, 'corpus.report.json');

  fs.writeFileSync(reportAPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'clean-call',
      category: 'clean-2-speaker',
      audioPath: '/tmp/clean.wav',
    },
    referenceEngine: 'human-rttm',
    candidates: [
      {
        engine: 'sherpa-onnx',
        metrics: {
          diarizationErrorRate: 0,
          jaccardErrorRate: 0,
        },
        gate: {
          status: 'default_candidate',
          reasons: [],
        },
        practicalMetrics: {},
        assignedTranscripts: [],
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2,
        },
      },
      {
        engine: 'pyannote-community-1',
        metrics: {
          diarizationErrorRate: 0,
          jaccardErrorRate: 0,
        },
        gate: {
          status: 'optional_candidate',
          reasons: ['integration_not_native'],
        },
        practicalMetrics: {},
        assignedTranscripts: [],
        practical: {
          integration: 'python-sidecar',
          localProcessing: true,
          licenseUse: 'gated_model_notice_required',
          runtimeFactor: 1.5,
        },
      },
    ],
    decision: {
      status: 'native_default_candidate_available',
      defaultCandidate: 'sherpa-onnx',
      optionalCandidate: 'pyannote-community-1',
      blockers: [],
    },
  }, null, 2));
  fs.writeFileSync(reportBPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'overlap-call',
      category: 'overlap-heavy',
      audioPath: '/tmp/overlap.wav',
    },
    referenceEngine: 'human-rttm',
    candidates: [
      {
        engine: 'sherpa-onnx',
        metrics: {
          diarizationErrorRate: 0.125,
          jaccardErrorRate: 0.125,
        },
        gate: {
          status: 'default_candidate',
          reasons: [],
        },
        practicalMetrics: {},
        assignedTranscripts: [],
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2,
        },
      },
    ],
    decision: {
      status: 'native_default_candidate_available',
      defaultCandidate: 'sherpa-onnx',
      optionalCandidate: null,
      blockers: [],
    },
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--reports',
    reportAPath,
    reportBPath,
    '--required-categories',
    'clean-2-speaker,overlap-heavy',
    '--output',
    outputPath,
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const corpusReport = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(corpusReport.decision.defaultCandidate, 'sherpa-onnx');
  assert.equal(corpusReport.decision.optionalCandidate, null);
  assert.equal(corpusReport.candidates.find((candidate) => candidate.engine === 'sherpa-onnx').meanDer, 0.0625);
  assert.deepEqual(corpusReport.categoryCoverage.map((entry) => entry.status), ['labeled', 'labeled']);
});
