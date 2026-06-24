import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-sweep.mjs');

test('diarization sweep CLI materializes candidate variants and ranks them by DER', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-sweep-'));
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const baseConfigPath = path.join(tmpDir, 'base.config.json');
  const sweepConfigPath = path.join(tmpDir, 'sweep.config.json');
  const outputDir = path.join(tmpDir, 'sweep-output');
  const sweepReportPath = path.join(tmpDir, 'sweep.report.json');

  fs.writeFileSync(referencePath, [
    'SPEAKER fixture 1 0.000 4.000 <NA> <NA> Alice <NA> <NA>',
    'SPEAKER fixture 1 3.000 4.000 <NA> <NA> Bob <NA> <NA>',
  ].join('\n'));
  fs.writeFileSync(baseConfigPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-sweep',
      category: 'overlap-heavy',
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
        path: 'outputs/{variantId}.rttm',
        run: {
          command: process.execPath,
          args: [
            '-e',
            'require("fs").writeFileSync(process.argv[1], process.argv[2])',
            '{outputPath}',
            '{param.rttm}',
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
  fs.writeFileSync(sweepConfigPath, JSON.stringify({
    baseConfig: baseConfigPath,
    outputDir,
    variants: [
      {
        id: 'miss-overlap',
        candidate: 'sherpa-onnx',
        parameters: {
          clusterThreshold: '0.50',
          rttm: [
            'SPEAKER fixture 1 0.000 4.000 <NA> <NA> Alice <NA> <NA>',
            'SPEAKER fixture 1 4.000 3.000 <NA> <NA> Bob <NA> <NA>',
            '',
          ].join('\n'),
        },
        patch: {
          engine: 'sherpa-onnx::{variantId}',
          practical: {
            runtimeFactor: 2,
          },
        },
      },
      {
        id: 'preserve-overlap',
        candidate: 'sherpa-onnx',
        parameters: {
          clusterThreshold: '0.35',
          rttm: [
            'SPEAKER fixture 1 0.000 4.000 <NA> <NA> Alice <NA> <NA>',
            'SPEAKER fixture 1 3.000 4.000 <NA> <NA> Bob <NA> <NA>',
            '',
          ].join('\n'),
        },
        patch: {
          engine: 'sherpa-onnx::{variantId}',
          practical: {
            runtimeFactor: 2,
          },
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--config',
    sweepConfigPath,
    '--output',
    sweepReportPath,
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const sweepReport = JSON.parse(fs.readFileSync(sweepReportPath, 'utf8'));
  assert.equal(sweepReport.bestDefaultVariant.id, 'preserve-overlap');
  assert.deepEqual(sweepReport.variants.map((variant) => ({
    id: variant.id,
    engine: variant.engine,
    der: variant.der,
    gate: variant.gate,
    clusterThreshold: variant.parameters.clusterThreshold,
  })), [
    {
      id: 'preserve-overlap',
      engine: 'sherpa-onnx::preserve-overlap',
      der: 0,
      gate: 'default_candidate',
      clusterThreshold: '0.35',
    },
    {
      id: 'miss-overlap',
      engine: 'sherpa-onnx::miss-overlap',
      der: 0.125,
      gate: 'default_candidate',
      clusterThreshold: '0.50',
    },
  ]);
  assert.equal(fs.existsSync(path.join(outputDir, 'configs', 'preserve-overlap.config.json')), true);
  assert.equal(fs.existsSync(path.join(outputDir, 'reports', 'preserve-overlap.report.json')), true);
});

test('diarization sweep CLI resolves no-run variant output files relative to the base config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-sweep-files-'));
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const candidateDir = path.join(tmpDir, 'outputs');
  const candidatePath = path.join(candidateDir, 'candidate.rttm');
  const baseConfigPath = path.join(tmpDir, 'base.config.json');
  const sweepConfigPath = path.join(tmpDir, 'sweep.config.json');
  const outputDir = path.join(tmpDir, 'sweep-output');
  const sweepReportPath = path.join(tmpDir, 'sweep.report.json');

  fs.mkdirSync(candidateDir, { recursive: true });
  fs.writeFileSync(referencePath, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\n');
  fs.writeFileSync(candidatePath, 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\n');
  fs.writeFileSync(baseConfigPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-sweep-file',
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
        path: 'outputs/candidate.rttm',
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2,
        },
      },
    ],
  }, null, 2));
  fs.writeFileSync(sweepConfigPath, JSON.stringify({
    baseConfig: baseConfigPath,
    outputDir,
    variants: [
      {
        id: 'existing-file',
        candidate: 'sherpa-onnx',
        patch: {
          engine: 'sherpa-onnx::{variantId}',
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--config',
    sweepConfigPath,
    '--output',
    sweepReportPath,
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const sweepReport = JSON.parse(fs.readFileSync(sweepReportPath, 'utf8'));
  assert.equal(sweepReport.bestDefaultVariant.id, 'existing-file');
  assert.equal(sweepReport.variants[0].der, 0);
});

test('diarization sweep CLI resolves run audio paths and cwd relative to the base config', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-diarization-sweep-run-paths-'));
  const audioDir = path.join(tmpDir, 'audio');
  const audioPath = path.join(audioDir, 'fixture.wav');
  const referencePath = path.join(tmpDir, 'reference.rttm');
  const baseConfigPath = path.join(tmpDir, 'base.config.json');
  const sweepConfigPath = path.join(tmpDir, 'sweep.config.json');
  const outputDir = path.join(tmpDir, 'sweep-output');
  const sweepReportPath = path.join(tmpDir, 'sweep.report.json');
  const rttm = 'SPEAKER fixture 1 0.000 2.000 <NA> <NA> Alice <NA> <NA>\\n';

  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(audioPath, 'not real audio');
  fs.writeFileSync(referencePath, rttm);
  fs.writeFileSync(baseConfigPath, JSON.stringify({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-sweep-run-paths',
      category: 'clean-2-speaker',
      audioPath: 'audio/fixture.wav',
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
        path: 'outputs/{variantId}.rttm',
        run: {
          command: process.execPath,
          cwd: '.',
          args: [
            '-e',
            [
              'const fs = require("fs");',
              'const path = require("path");',
              'const audioPath = process.argv[1];',
              'const outputPath = process.argv[2];',
              'const expectedCwd = process.argv[3];',
              'const rttm = process.argv[4];',
              'if (process.cwd() !== expectedCwd) throw new Error(`bad cwd ${process.cwd()}`);',
              'if (!path.isAbsolute(audioPath)) throw new Error("audio not absolute " + audioPath);',
              'if (!fs.existsSync(audioPath)) throw new Error("missing audio " + audioPath);',
              'fs.mkdirSync(path.dirname(outputPath), { recursive: true });',
              'fs.writeFileSync(outputPath, rttm);',
            ].join(' '),
            '{audioPath}',
            '{outputPath}',
            '{param.expectedCwd}',
            '{param.rttm}',
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
  fs.writeFileSync(sweepConfigPath, JSON.stringify({
    baseConfig: baseConfigPath,
    outputDir,
    variants: [
      {
        id: 'run-paths',
        candidate: 'sherpa-onnx',
        parameters: {
          expectedCwd: fs.realpathSync(tmpDir),
          rttm,
        },
        patch: {
          engine: 'sherpa-onnx::{variantId}',
          practical: {
            runtimeFactor: 2,
          },
        },
      },
    ],
  }, null, 2));

  execFileSync('node', [
    scriptPath,
    '--config',
    sweepConfigPath,
    '--output',
    sweepReportPath,
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  const sweepReport = JSON.parse(fs.readFileSync(sweepReportPath, 'utf8'));
  assert.equal(sweepReport.bestDefaultVariant.id, 'run-paths');
});
