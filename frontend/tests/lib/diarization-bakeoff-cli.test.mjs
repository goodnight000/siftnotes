import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-bakeoff.mjs');

test('diarization bakeoff CLI reads local RTTM/transcript files and writes a report', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-bakeoff-'));
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const sherpaPath = path.join(tmpDir, 'sherpa.rttm');
  const pyannotePath = path.join(tmpDir, 'pyannote.rttm');
  const transcriptsPath = path.join(tmpDir, 'transcripts.json');
  const configPath = path.join(tmpDir, 'config.json');
  const outputPath = path.join(tmpDir, 'report.json');

  fs.writeFileSync(referencePath, [
    'SPEAKER fixture 1 0.000 4.000 <NA> <NA> Alice <NA> <NA>',
    'SPEAKER fixture 1 3.000 4.000 <NA> <NA> Bob <NA> <NA>',
  ].join('\n'));
  fs.writeFileSync(sherpaPath, [
    'SPEAKER fixture 1 0.000 4.000 <NA> <NA> Alice <NA> <NA>',
    'SPEAKER fixture 1 4.000 3.000 <NA> <NA> Bob <NA> <NA>',
  ].join('\n'));
  fs.writeFileSync(pyannotePath, [
    'SPEAKER fixture 1 0.000 4.000 <NA> <NA> Alice <NA> <NA>',
    'SPEAKER fixture 1 4.000 3.000 <NA> <NA> Bob <NA> <NA>',
  ].join('\n'));
  fs.writeFileSync(transcriptsPath, JSON.stringify([
    {
      id: 't1',
      text: 'overlap',
      timestamp: '10:00:03',
      audio_start_time: 3.25,
      audio_end_time: 3.75,
    },
  ]));
  fs.writeFileSync(configPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-overlap',
      category: 'overlap-heavy',
      audioPath: '/tmp/fixture.wav',
    },
    gates: {
      maxDefaultDer: 0.18,
      maxDefaultJer: 0.2,
      minDefaultRuntimeFactor: 1,
    },
    reference: {
      engine: 'human-rttm',
      format: 'rttm',
      path: referencePath,
    },
    transcripts: {
      path: transcriptsPath,
    },
    candidates: [
      {
        engine: 'sherpa-onnx',
        format: 'rttm',
        path: sherpaPath,
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2.4,
        },
      },
      {
        engine: 'pyannote-community-1',
        format: 'rttm',
        path: pyannotePath,
        practical: {
          integration: 'python-sidecar',
          localProcessing: true,
          licenseUse: 'gated_model_notice_required',
          runtimeFactor: 0.8,
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [scriptPath, '--config', configPath, '--output', outputPath], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.decision.status, 'native_default_candidate_available');
  assert.equal(report.decision.defaultCandidate, 'sherpa-onnx');
  assert.equal(report.decision.optionalCandidate, 'pyannote-community-1');
  assert.equal(report.candidates[0].metrics.diarizationErrorRate, 0.125);
  assert.equal(report.candidates[0].assignedTranscripts[0].diarization.speaker, 'Alice');
});

test('diarization bakeoff CLI can run a local candidate adapter before scoring', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-runner-'));
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const transcriptsPath = path.join(tmpDir, 'transcripts.json');
  const generatedCandidatePath = path.join(tmpDir, 'generated-sherpa.rttm');
  const configPath = path.join(tmpDir, 'config.json');
  const outputPath = path.join(tmpDir, 'report.json');

  fs.writeFileSync(referencePath, [
    'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>',
  ].join('\n'));
  fs.writeFileSync(transcriptsPath, JSON.stringify([
    {
      id: 't1',
      text: 'hello',
      timestamp: '10:00:00',
      audio_start_time: 0.25,
      audio_end_time: 1.25,
    },
  ]));
  fs.writeFileSync(configPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-runner',
      category: 'clean-2-speaker',
      audioPath: '/tmp/fixture.wav',
      durationSeconds: 10,
    },
    reference: {
      engine: 'human-rttm',
      format: 'rttm',
      path: referencePath,
    },
    transcripts: {
      path: transcriptsPath,
    },
    candidates: [
      {
        engine: 'sherpa-onnx',
        format: 'rttm',
        path: generatedCandidatePath,
        run: {
          command: process.execPath,
          args: [
            '-e',
            "require('fs').writeFileSync(process.argv[1], 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\\n')",
            '{outputPath}',
          ],
        },
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [scriptPath, '--config', configPath, '--output', outputPath], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  assert.equal(fs.existsSync(generatedCandidatePath), true);
  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.candidates[0].metrics.diarizationErrorRate, 0);
  assert.equal(report.decision.defaultCandidate, 'sherpa-onnx');
  assert.equal(typeof report.candidates[0].practical.runtimeSeconds, 'number');
  assert.equal(report.candidates[0].practical.runtimeSeconds > 0, true);
  assert.equal(typeof report.candidates[0].practical.runtimeFactor, 'number');
  assert.equal(report.candidates[0].practical.runtimeFactor > 0, true);
});

test('diarization bakeoff CLI resolves config-relative audio paths before adapter runs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-runner-audio-'));
  const audioDir = path.join(tmpDir, 'audio');
  const audioPath = path.join(audioDir, 'fixture.wav');
  const generatedCandidatePath = path.join(tmpDir, 'generated-sherpa.rttm');
  const configPath = path.join(tmpDir, 'config.json');
  const outputPath = path.join(tmpDir, 'report.json');

  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(audioPath, 'audio bytes are not read by this adapter test');
  fs.writeFileSync(configPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-runner-relative-audio',
      category: 'clean-2-speaker',
      audioPath: 'audio/fixture.wav',
      durationSeconds: 10,
    },
    candidates: [
      {
        engine: 'sherpa-onnx',
        format: 'rttm',
        path: generatedCandidatePath,
        run: {
          command: process.execPath,
          args: [
            '-e',
            [
              "const fs = require('fs')",
              'const audio = process.argv[1]',
              'const output = process.argv[2]',
              'const expectedAudio = process.argv[3]',
              "if (audio !== expectedAudio) throw new Error(`audio path was not resolved: ${audio}`)",
              'if (!fs.existsSync(audio)) throw new Error(`audio path does not exist: ${audio}`)',
              "fs.writeFileSync(output, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\\n')",
            ].join('; '),
            '{audioPath}',
            '{outputPath}',
            audioPath,
          ],
        },
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [scriptPath, '--config', configPath, '--output', outputPath], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.candidates[0].practical.runtimeFactor > 0, true);
  assert.equal(fs.existsSync(generatedCandidatePath), true);
});

test('diarization bakeoff CLI accepts unlabeled configs and writes practical metrics', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-unlabeled-'));
  const candidatePath = path.join(tmpDir, 'sherpa.rttm');
  const configPath = path.join(tmpDir, 'config.json');
  const outputPath = path.join(tmpDir, 'report.json');

  fs.writeFileSync(candidatePath, [
    'SPEAKER fixture 1 0.000 4.000 <NA> <NA> SPEAKER_00 <NA> <NA>',
    'SPEAKER fixture 1 3.000 2.000 <NA> <NA> SPEAKER_01 <NA> <NA>',
    'SPEAKER fixture 1 6.000 2.000 <NA> <NA> SPEAKER_01 <NA> <NA>',
  ].join('\n'));
  fs.writeFileSync(configPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'unlabeled-overlap',
      category: 'overlap-heavy',
      audioPath: '/tmp/unlabeled.wav',
      durationSeconds: 10,
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
          peakMemoryMb: 512,
          installComplexity: 'native_binary_with_models',
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [scriptPath, '--config', configPath, '--output', outputPath], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.referenceEngine, null);
  assert.equal(report.candidates[0].metrics, null);
  assert.deepEqual(report.candidates[0].practicalMetrics, {
    speakerCount: 2,
    turnCount: 3,
    rejectedTurnCount: 0,
    speechSeconds: 7,
    speakerSeconds: 8,
    overlapRegionSeconds: 1,
    overlapSpeakerSeconds: 2,
    overlapRatio: 0.1,
    turnsPerMinute: 18,
  });
  assert.deepEqual(report.decision.blockers, ['sherpa-onnx:missing_reference_labels']);
});

test('diarization bakeoff CLI measures candidate model size from local model paths', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-model-size-'));
  const modelDir = path.join(tmpDir, 'models');
  const modelAPath = path.join(modelDir, 'segmentation.onnx');
  const modelBPath = path.join(modelDir, 'embedding.onnx');
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const candidatePath = path.join(tmpDir, 'candidate.rttm');
  const configPath = path.join(tmpDir, 'config.json');
  const outputPath = path.join(tmpDir, 'report.json');

  fs.mkdirSync(modelDir, { recursive: true });
  fs.writeFileSync(modelAPath, Buffer.alloc(1024 * 1024));
  fs.writeFileSync(modelBPath, Buffer.alloc(512 * 1024));
  fs.writeFileSync(referencePath, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\n');
  fs.writeFileSync(candidatePath, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\n');
  fs.writeFileSync(configPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-model-size',
      category: 'clean-2-speaker',
      audioPath: '/tmp/fixture.wav',
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
        modelPaths: [
          'models/segmentation.onnx',
          'models/embedding.onnx',
        ],
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2,
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [scriptPath, '--config', configPath, '--output', outputPath], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.candidates[0].practical.modelSizeMb, 1.5);
});

test('diarization bakeoff CLI merges adapter stats sidecar into practical metadata', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-stats-'));
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const generatedCandidatePath = path.join(tmpDir, 'generated-sherpa.rttm');
  const configPath = path.join(tmpDir, 'config.json');
  const outputPath = path.join(tmpDir, 'report.json');

  fs.writeFileSync(referencePath, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\n');
  fs.writeFileSync(configPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-stats',
      category: 'clean-2-speaker',
      audioPath: '/tmp/fixture.wav',
      durationSeconds: 10,
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
        path: generatedCandidatePath,
        run: {
          command: process.execPath,
          args: [
            '-e',
            [
              "const fs = require('fs');",
              "fs.writeFileSync(process.argv[1], 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\\n');",
              "fs.writeFileSync(process.argv[2], JSON.stringify({ peakMemoryMb: 123.5, adapterRuntimeSeconds: 0.25 }));",
            ].join(' '),
            '{outputPath}',
            '{statsPath}',
          ],
        },
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [scriptPath, '--config', configPath, '--output', outputPath], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const report = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  assert.equal(report.candidates[0].practical.peakMemoryMb, 123.5);
  assert.equal(report.candidates[0].practical.adapterRuntimeSeconds, 0.25);
});
