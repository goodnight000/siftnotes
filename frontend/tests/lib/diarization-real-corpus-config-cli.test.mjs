import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-real-corpus-configs.mjs');

test('real corpus config CLI generates configs only for approved manifest items', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-real-configs-'));
  const manifestPath = path.join(tmpDir, 'manifest.json');
  const outputDir = path.join(tmpDir, 'configs');
  const reportPath = path.join(tmpDir, 'index.json');
  const audioPath = path.join(tmpDir, 'approved.wav');
  const transcriptPath = path.join(tmpDir, 'transcripts.json');
  const referencePath = path.join(tmpDir, 'reference.rttm');

  fs.writeFileSync(audioPath, 'not read by generator');
  fs.writeFileSync(transcriptPath, '[]');
  fs.writeFileSync(referencePath, 'SPEAKER fixture 1 0.000 1.000 <NA> <NA> Alice <NA> <NA>\n');
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
        audioPath,
        transcriptPath,
        referenceRttmPath: referencePath,
        expectedSpeakerCount: 2,
        durationSeconds: 60,
        sampleRate: 16000,
      },
      {
        id: 'overlap-001',
        category: 'overlap-heavy',
        approvalStatus: 'pending',
        audioPath: path.join(tmpDir, 'pending.wav'),
      },
    ],
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--manifest',
    manifestPath,
    '--output-dir',
    outputDir,
    '--report',
    reportPath,
    '--include-pyannote',
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const index = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(index.generated.length, 1);
  assert.equal(index.skipped.length, 1);
  assert.deepEqual(index.skipped[0], {
    id: 'overlap-001',
    category: 'overlap-heavy',
    reason: 'approval_pending',
  });

  const generatedConfig = JSON.parse(fs.readFileSync(index.generated[0].configPath, 'utf8'));
  assert.equal(generatedConfig.corpusItem.id, 'clean-call-001');
  assert.equal(generatedConfig.corpusItem.category, 'clean-2-speaker');
  assert.equal(generatedConfig.corpusItem.audioPath, audioPath);
  assert.equal(generatedConfig.reference.path, referencePath);
  assert.equal(generatedConfig.transcripts.path, transcriptPath);
  assert.deepEqual(generatedConfig.candidates.map((candidate) => candidate.engine), [
    'sherpa-onnx',
    'pyannote-community-1',
  ]);
  assert.equal(generatedConfig.candidates[0].run.args.includes('--num-speakers'), true);
  assert.equal(generatedConfig.candidates[0].run.args.includes('2'), true);
  assert.equal(generatedConfig.candidates[1].run.args.includes('--num-speakers'), true);
  assert.equal(generatedConfig.candidates[1].run.args.includes('2'), true);
});
