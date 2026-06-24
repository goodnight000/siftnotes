import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'diarization-public-corpora', 'ami-nxt-to-fixtures.py');

test('AMI public corpus converter emits RTTM and Meetily transcript fixtures', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-ami-fixture-'));
  const annotationsDir = path.join(tmpDir, 'annotations');
  const segmentsDir = path.join(annotationsDir, 'segments');
  const wordsDir = path.join(annotationsDir, 'words');
  const rttmPath = path.join(tmpDir, 'reference.rttm');
  const transcriptsPath = path.join(tmpDir, 'transcripts.json');

  fs.mkdirSync(segmentsDir, { recursive: true });
  fs.mkdirSync(wordsDir, { recursive: true });

  fs.writeFileSync(path.join(segmentsDir, 'TEST001.A.segments.xml'), `<?xml version="1.0"?>
<nite:root xmlns:nite="http://nite.sourceforge.net/">
  <segment nite:id="TEST001.sync.1" transcriber_start="1.000" transcriber_end="2.500">
    <nite:child href="TEST001.A.words.xml#id(TEST001.A.words0)..id(TEST001.A.words2)"/>
  </segment>
</nite:root>
`);
  fs.writeFileSync(path.join(wordsDir, 'TEST001.A.words.xml'), `<?xml version="1.0"?>
<nite:root xmlns:nite="http://nite.sourceforge.net/">
  <w nite:id="TEST001.A.words0" starttime="1.000" endtime="1.200">hello</w>
  <w nite:id="TEST001.A.words1" starttime="1.200" endtime="1.500">there</w>
  <w nite:id="TEST001.A.words2" starttime="1.500" endtime="1.500" punc="true">.</w>
</nite:root>
`);
  fs.writeFileSync(path.join(segmentsDir, 'TEST001.B.segments.xml'), `<?xml version="1.0"?>
<nite:root xmlns:nite="http://nite.sourceforge.net/">
  <segment nite:id="TEST001.sync.2" transcriber_start="2.000" transcriber_end="3.000">
    <nite:child href="TEST001.B.words.xml#id(TEST001.B.words0)"/>
  </segment>
</nite:root>
`);
  fs.writeFileSync(path.join(wordsDir, 'TEST001.B.words.xml'), `<?xml version="1.0"?>
<nite:root xmlns:nite="http://nite.sourceforge.net/">
  <w nite:id="TEST001.B.words0" starttime="2.000" endtime="3.000">overlap</w>
</nite:root>
`);

  execFileSync('python3', [
    scriptPath,
    '--meeting-id',
    'TEST001',
    '--annotations-dir',
    annotationsDir,
    '--output-rttm',
    rttmPath,
    '--output-transcripts',
    transcriptsPath,
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  assert.equal(fs.readFileSync(rttmPath, 'utf8'), [
    'SPEAKER TEST001 1 1.000 1.500 <NA> <NA> AMI_A <NA> <NA>',
    'SPEAKER TEST001 1 2.000 1.000 <NA> <NA> AMI_B <NA> <NA>',
    '',
  ].join('\n'));

  const transcripts = JSON.parse(fs.readFileSync(transcriptsPath, 'utf8'));
  assert.deepEqual(transcripts.map((segment) => ({
    id: segment.id,
    text: segment.text,
    audio_start_time: segment.audio_start_time,
    audio_end_time: segment.audio_end_time,
    sourceSpeaker: segment.sourceSpeaker,
  })), [
    {
      id: 'TEST001-A-0001',
      text: 'hello there.',
      audio_start_time: 1,
      audio_end_time: 2.5,
      sourceSpeaker: 'AMI_A',
    },
    {
      id: 'TEST001-B-0001',
      text: 'overlap',
      audio_start_time: 2,
      audio_end_time: 3,
      sourceSpeaker: 'AMI_B',
    },
  ]);
});

test('AMI public corpus converter trims fixtures to an audio clip window', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meetily-ami-clip-'));
  const annotationsDir = path.join(tmpDir, 'annotations');
  const segmentsDir = path.join(annotationsDir, 'segments');
  const wordsDir = path.join(annotationsDir, 'words');
  const rttmPath = path.join(tmpDir, 'reference.rttm');
  const transcriptsPath = path.join(tmpDir, 'transcripts.json');

  fs.mkdirSync(segmentsDir, { recursive: true });
  fs.mkdirSync(wordsDir, { recursive: true });
  fs.writeFileSync(path.join(segmentsDir, 'TEST002.A.segments.xml'), `<?xml version="1.0"?>
<nite:root xmlns:nite="http://nite.sourceforge.net/">
  <segment nite:id="TEST002.sync.1" transcriber_start="10.000" transcriber_end="12.000">
    <nite:child href="TEST002.A.words.xml#id(TEST002.A.words0)"/>
  </segment>
</nite:root>
`);
  fs.writeFileSync(path.join(wordsDir, 'TEST002.A.words.xml'), `<?xml version="1.0"?>
<nite:root xmlns:nite="http://nite.sourceforge.net/">
  <w nite:id="TEST002.A.words0" starttime="10.000" endtime="12.000">trimmed</w>
</nite:root>
`);

  execFileSync('python3', [
    scriptPath,
    '--meeting-id',
    'TEST002',
    '--annotations-dir',
    annotationsDir,
    '--clip-start-seconds',
    '10.500',
    '--clip-end-seconds',
    '11.250',
    '--output-rttm',
    rttmPath,
    '--output-transcripts',
    transcriptsPath,
  ], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  assert.equal(fs.readFileSync(rttmPath, 'utf8'), [
    'SPEAKER TEST002 1 0.000 0.750 <NA> <NA> AMI_A <NA> <NA>',
    '',
  ].join('\n'));

  const transcripts = JSON.parse(fs.readFileSync(transcriptsPath, 'utf8'));
  assert.equal(transcripts[0].audio_start_time, 0);
  assert.equal(transcripts[0].audio_end_time, 0.75);
  assert.equal(transcripts[0].timestamp, '00:00:00.000');
});
