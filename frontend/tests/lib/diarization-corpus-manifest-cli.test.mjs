import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-corpus-manifest.mjs');

test('diarization corpus manifest CLI reports approval and labeling blockers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-manifest-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const outputPath = path.join(tmpDir, 'manifest.report.json');

  fs.writeFileSync(manifestPath, JSON.stringify({
    requiredCategories: [
      'clean-2-speaker',
      'overlap-heavy',
    ],
    items: [
      {
        id: 'clean-call-001',
        category: 'clean-2-speaker',
        approvalStatus: 'approved',
        audioPath: '/local/clean.wav',
        transcriptPath: '/local/clean.transcripts.json',
        referenceRttmPath: '/local/clean.rttm',
      },
      {
        id: 'overlap-001',
        category: 'overlap-heavy',
        approvalStatus: 'pending',
        audioPath: '/local/overlap.wav',
      },
    ],
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--manifest',
    manifestPath,
    '--output',
    outputPath,
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.readiness.unlabeledBakeoffReady, false);
  assert.equal(report.readiness.labeledDecisionReady, false);
  assert.deepEqual(report.categoryCoverage.map((entry) => entry.status), [
    'labeled',
    'pending_approval',
  ]);
  assert.deepEqual(report.readiness.blockers, [
    'category:overlap-heavy:no_approved_audio',
    'category:overlap-heavy:no_labeled_reference',
    'category:overlap-heavy:no_approved_transcripts',
    'item:overlap-001:approval_pending',
  ]);
});
