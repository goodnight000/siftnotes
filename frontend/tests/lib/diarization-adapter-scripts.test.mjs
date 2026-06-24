import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function readTemplate(scriptName) {
  const scriptPath = path.join(repoRoot, 'scripts', 'diarization-adapters', scriptName);
  return JSON.parse(execFileSync('python3', [scriptPath, '--print-config-template'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }));
}

test('pyannote Community-1 adapter exposes a bakeoff config template', () => {
  const template = readTemplate('pyannote-community-1.py');

  assert.equal(template.engine, 'pyannote-community-1');
  assert.equal(template.format, 'rttm');
  assert.deepEqual(template.run.args.slice(0, 5), [
    'scripts/diarization-adapters/pyannote-community-1.py',
    '--audio',
    '{audioPath}',
    '--output',
    '{outputPath}',
  ]);
  assert.equal(template.run.args.includes('--stats-output'), true);
  assert.equal(template.run.args.includes('{statsPath}'), true);
  assert.equal(template.practical.integration, 'python-sidecar');
  assert.equal(template.practical.localProcessing, true);
  assert.equal(template.practical.licenseUse, 'gated_model_notice_required');
  assert.deepEqual(template.modelPaths, [
    'models/pyannote/speaker-diarization-community-1',
  ]);
});

test('pyannote Community-1 adapter exposes a model access probe', () => {
  const scriptPath = path.join(repoRoot, 'scripts', 'diarization-adapters', 'pyannote-community-1.py');
  const help = execFileSync('python3', [scriptPath, '--help'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.match(help, /--check-model-access/);
});

test('sherpa-onnx adapter exposes a native-candidate bakeoff config template', () => {
  const template = readTemplate('sherpa-onnx.py');

  assert.equal(template.engine, 'sherpa-onnx');
  assert.equal(template.format, 'rttm');
  assert.deepEqual(template.run.args.slice(0, 5), [
    'scripts/diarization-adapters/sherpa-onnx.py',
    '--audio',
    '{audioPath}',
    '--output',
    '{outputPath}',
  ]);
  assert.equal(template.run.args.includes('--stats-output'), true);
  assert.equal(template.run.args.includes('{statsPath}'), true);
  assert.equal(template.practical.integration, 'native');
  assert.equal(template.practical.localProcessing, true);
  assert.equal(template.practical.licenseUse, 'app_default_ok');
  assert.deepEqual(template.modelPaths, [
    'models/sherpa-onnx-pyannote-segmentation-3-0/model.onnx',
    'models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
  ]);
});
