import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-adapters', 'separated-channel-energy.py');

function writeSineWav(filePath, {
  sampleRate = 16000,
  durationSeconds = 2,
  activeStartSeconds,
  activeEndSeconds,
}) {
  const sampleCount = sampleRate * durationSeconds;
  const dataSize = sampleCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleRate;
    const active = t >= activeStartSeconds && t < activeEndSeconds;
    const sample = active ? Math.round(Math.sin(2 * Math.PI * 440 * t) * 10000) : 0;
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  fs.writeFileSync(filePath, buffer);
}

test('separated channel energy adapter writes speaker RTTM per active channel', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-separated-channel-'));
  const alicePath = path.join(tmpDir, 'alice.wav');
  const bobPath = path.join(tmpDir, 'bob.wav');
  const outputPath = path.join(tmpDir, 'output.rttm');

  writeSineWav(alicePath, {
    activeStartSeconds: 0.2,
    activeEndSeconds: 0.8,
  });
  writeSineWav(bobPath, {
    activeStartSeconds: 0.6,
    activeEndSeconds: 1.2,
  });

  execFileSync('python3', [
    scriptPath,
    '--channel',
    `AMI_A=${alicePath}`,
    '--channel',
    `AMI_B=${bobPath}`,
    '--output',
    outputPath,
    '--file-id',
    'fixture',
    '--window-seconds',
    '0.1',
    '--threshold-ratio',
    '0.2',
    '--min-duration',
    '0.1',
    '--min-gap',
    '0.05',
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  assert.equal(fs.readFileSync(outputPath, 'utf8'), [
    'SPEAKER fixture 1 0.200 0.600 <NA> <NA> AMI_A <NA> <NA>',
    'SPEAKER fixture 1 0.600 0.600 <NA> <NA> AMI_B <NA> <NA>',
    '',
  ].join('\n'));
});
