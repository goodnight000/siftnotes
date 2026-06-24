import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const modulePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'lib',
  'diarization-evaluation.ts',
);
const require = createRequire(import.meta.url);

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;

  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    require,
  });
  return module.exports;
}

function plainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

const {
  assignSpeakersToTranscriptSegments,
  buildDiarizationCorpusManifestReport,
  buildDiarizationCorpusReport,
  buildDiarizationBakeoffReport,
  computeTranscriptReconciliationMetrics,
  computeDiarizationMetrics,
  parseRttm,
  normalizeDiarizationOutput,
} = loadTsModule(modulePath);

test('normalizes engine output into sorted validated speaker turns', () => {
  const output = normalizeDiarizationOutput({
    engine: 'pyannote-community-1',
    engineVersion: 'community-1',
    audio: {
      path: '/tmp/meeting.wav',
      durationSeconds: 10,
      sampleRate: 16000,
    },
    turns: [
      { start: 5, end: 3, speaker: 'bad-range' },
      { start: 1, end: 2, speaker: 'Bob' },
      { start: 0.0044, end: 1.2364, speaker: 'Alice', confidence: 0.9321 },
      { start: -1, end: 0.5, speaker: 'Alice' },
    ],
  });

  assert.deepEqual(plainObject(output), {
    engine: 'pyannote-community-1',
    engineVersion: 'community-1',
    audio: {
      path: '/tmp/meeting.wav',
      durationSeconds: 10,
      sampleRate: 16000,
    },
    turns: [
      { start: 0, end: 0.5, speaker: 'Alice', overlap: false },
      { start: 0.004, end: 1.236, speaker: 'Alice', confidence: 0.932, overlap: true },
      { start: 1, end: 2, speaker: 'Bob', overlap: true },
    ],
    rejectedTurns: [
      { start: 5, end: 3, speaker: 'bad-range', reason: 'end_must_be_after_start' },
    ],
  });
});

test('computes overlap-aware DER and JER for missed overlapped speech', () => {
  const metrics = computeDiarizationMetrics({
    referenceTurns: [
      { start: 0, end: 4, speaker: 'Alice' },
      { start: 3, end: 7, speaker: 'Bob' },
    ],
    hypothesisTurns: [
      { start: 0, end: 4, speaker: 'Alice' },
      { start: 4, end: 7, speaker: 'Bob' },
    ],
  });

  assert.deepEqual(plainObject(metrics.speakerMapping), {
    Alice: 'Alice',
    Bob: 'Bob',
  });
  assert.equal(metrics.totalReferenceSpeakerSeconds, 8);
  assert.equal(metrics.overlapReferenceSeconds, 1);
  assert.equal(metrics.missedSpeechSeconds, 1);
  assert.equal(metrics.falseAlarmSeconds, 0);
  assert.equal(metrics.speakerConfusionSeconds, 0);
  assert.equal(metrics.diarizationErrorRate, 0.125);
  assert.equal(metrics.jaccardErrorRate, 0.125);
});

test('finds the best speaker mapping before scoring hypothesis labels', () => {
  const metrics = computeDiarizationMetrics({
    referenceTurns: [
      { start: 0, end: 5, speaker: 'Alice' },
      { start: 5, end: 10, speaker: 'Bob' },
    ],
    hypothesisTurns: [
      { start: 0, end: 5, speaker: 'SPEAKER_01' },
      { start: 5, end: 10, speaker: 'SPEAKER_00' },
    ],
  });

  assert.deepEqual(plainObject(metrics.speakerMapping), {
    SPEAKER_01: 'Alice',
    SPEAKER_00: 'Bob',
  });
  assert.equal(metrics.diarizationErrorRate, 0);
  assert.equal(metrics.jaccardErrorRate, 0);
});

test('scores over-clustered hypotheses without exhaustive speaker permutations', () => {
  const referenceTurns = [
    { start: 0, end: 1, speaker: 'A' },
    { start: 1, end: 2, speaker: 'B' },
    { start: 2, end: 3, speaker: 'C' },
    { start: 3, end: 4, speaker: 'D' },
  ];
  const hypothesisTurns = Array.from({ length: 21 }, (_, index) => ({
    start: index < 4 ? index : 10 + index,
    end: index < 4 ? index + 1 : 10.5 + index,
    speaker: `H${index}`,
  }));

  const metrics = computeDiarizationMetrics({
    referenceTurns,
    hypothesisTurns,
  });

  assert.deepEqual(plainObject(metrics.speakerMapping), {
    H0: 'A',
    H1: 'B',
    H2: 'C',
    H3: 'D',
  });
  assert.equal(metrics.falseAlarmSeconds, 8.5);
  assert.equal(metrics.diarizationErrorRate, 2.125);
});

test('counts unmapped hypothesis speech as false alarm', () => {
  const metrics = computeDiarizationMetrics({
    referenceTurns: [
      { start: 0, end: 1, speaker: 'A' },
    ],
    hypothesisTurns: [
      { start: 0, end: 1, speaker: 'H0' },
      { start: 2, end: 3, speaker: 'H1' },
    ],
  });

  assert.deepEqual(plainObject(metrics.speakerMapping), {
    H0: 'A',
  });
  assert.equal(metrics.falseAlarmSeconds, 1);
  assert.equal(metrics.diarizationErrorRate, 1);
});

test('assigns dominant and overlapped diarization speakers to Meetily transcript segments', () => {
  const assignments = assignSpeakersToTranscriptSegments({
    transcriptSegments: [
      {
        id: 't1',
        text: 'hello from alice',
        timestamp: '10:00:00',
        audio_start_time: 0.5,
        audio_end_time: 2.5,
      },
      {
        id: 't2',
        text: 'overlap',
        timestamp: '10:00:03',
        audio_start_time: 3.25,
        audio_end_time: 3.75,
      },
      {
        id: 't3',
        text: 'bob continues',
        timestamp: '10:00:05',
        audio_start_time: 5.2,
        audio_end_time: 6.2,
      },
      {
        id: 't4',
        text: 'legacy segment without audio timing',
        timestamp: '10:00:08',
      },
    ],
    diarizationTurns: [
      { start: 0, end: 4, speaker: 'Alice' },
      { start: 3, end: 7, speaker: 'Bob' },
    ],
  });

  assert.deepEqual(plainObject(assignments.map((segment) => segment.diarization)), [
    {
      speaker: 'Alice',
      coverageRatio: 1,
      coverageSeconds: 2,
      overlappedSpeakers: [],
      overlapSeconds: 0,
      assignmentReason: 'dominant_overlap',
    },
    {
      speaker: 'Alice',
      coverageRatio: 1,
      coverageSeconds: 0.5,
      overlappedSpeakers: ['Alice', 'Bob'],
      overlapSeconds: 0.5,
      assignmentReason: 'overlap_tie_earliest_turn',
    },
    {
      speaker: 'Bob',
      coverageRatio: 1,
      coverageSeconds: 1,
      overlappedSpeakers: [],
      overlapSeconds: 0,
      assignmentReason: 'dominant_overlap',
    },
    {
      speaker: null,
      coverageRatio: 0,
      coverageSeconds: 0,
      overlappedSpeakers: [],
      overlapSeconds: 0,
      assignmentReason: 'missing_audio_timestamps',
    },
  ]);
});

test('summarizes transcript reconciliation quality for assigned Meetily segments', () => {
  const assignments = assignSpeakersToTranscriptSegments({
    transcriptSegments: [
      {
        id: 'full',
        text: 'fully covered',
        timestamp: '10:00:00',
        audio_start_time: 0,
        audio_end_time: 2,
      },
      {
        id: 'partial',
        text: 'partly covered',
        timestamp: '10:00:03',
        audio_start_time: 3,
        audio_end_time: 5,
      },
      {
        id: 'none',
        text: 'no diarization nearby',
        timestamp: '10:00:08',
        audio_start_time: 8,
        audio_end_time: 9,
      },
      {
        id: 'missing',
        text: 'missing timing',
        timestamp: '10:00:09',
      },
      {
        id: 'overlap',
        text: 'two speakers at once',
        timestamp: '10:00:10',
        audio_start_time: 10,
        audio_end_time: 11,
      },
    ],
    diarizationTurns: [
      { start: 0, end: 3, speaker: 'Alice' },
      { start: 3, end: 3.8, speaker: 'Bob' },
      { start: 10, end: 11, speaker: 'Alice' },
      { start: 10, end: 11, speaker: 'Bob' },
    ],
  });

  assert.deepEqual(plainObject(computeTranscriptReconciliationMetrics(assignments)), {
    totalSegments: 5,
    timedSegments: 4,
    assignedSegments: 3,
    unassignedSegments: 2,
    missingTimingSegments: 1,
    noOverlapSegments: 1,
    lowCoverageAssignedSegments: 1,
    overlapSegmentCount: 1,
    tieSegmentCount: 1,
    totalTimedSegmentSeconds: 6,
    totalAssignedCoverageSeconds: 3.8,
    meanCoverageRatio: 0.6,
    assignmentReasonCounts: {
      dominant_overlap: 2,
      overlap_tie_earliest_turn: 1,
      missing_audio_timestamps: 1,
      no_diarization_overlap: 1,
    },
  });
});

test('parses RTTM speaker turns into the common diarization schema', () => {
  const output = parseRttm({
    engine: 'sherpa-onnx',
    engineVersion: 'reverb-diarization-v1',
    audioPath: '/tmp/meeting.wav',
    sampleRate: 16000,
    text: [
      'SPEAKER meeting 1 0.000 1.500 <NA> <NA> SPEAKER_00 <NA> <NA>',
      'SPEAKER meeting 1 1.250 2.000 <NA> <NA> SPEAKER_01 <NA> <NA>',
      'SPEAKER meeting 1 4.000 0.000 <NA> <NA> BAD <NA> <NA>',
      '# ignored',
      '',
    ].join('\n'),
  });

  assert.deepEqual(plainObject(output), {
    engine: 'sherpa-onnx',
    engineVersion: 'reverb-diarization-v1',
    audio: {
      path: '/tmp/meeting.wav',
      sampleRate: 16000,
    },
    turns: [
      { start: 0, end: 1.5, speaker: 'SPEAKER_00', overlap: true },
      { start: 1.25, end: 3.25, speaker: 'SPEAKER_01', overlap: true },
    ],
    rejectedTurns: [
      { start: 4, end: 4, speaker: 'BAD', reason: 'end_must_be_after_start' },
    ],
  });
});

test('builds a bakeoff report with app-readiness gates for native and sidecar engines', () => {
  const report = buildDiarizationBakeoffReport({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-overlap',
      category: 'overlap-heavy',
      audioPath: '/tmp/fixture.wav',
    },
    reference: {
      engine: 'human-rttm',
      turns: [
        { start: 0, end: 4, speaker: 'Alice' },
        { start: 3, end: 7, speaker: 'Bob' },
      ],
    },
    transcriptSegments: [
      {
        id: 't1',
        text: 'overlap',
        timestamp: '10:00:03',
        audio_start_time: 3.25,
        audio_end_time: 3.75,
      },
    ],
    candidates: [
      {
        output: {
          engine: 'sherpa-onnx',
          turns: [
            { start: 0, end: 4, speaker: 'Alice' },
            { start: 4, end: 7, speaker: 'Bob' },
          ],
        },
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2.4,
        },
      },
      {
        output: {
          engine: 'pyannote-community-1',
          turns: [
            { start: 0, end: 4, speaker: 'Alice' },
            { start: 4, end: 7, speaker: 'Bob' },
          ],
        },
        practical: {
          integration: 'python-sidecar',
          localProcessing: true,
          licenseUse: 'gated_model_notice_required',
          runtimeFactor: 0.8,
        },
      },
    ],
    gates: {
      maxDefaultDer: 0.18,
      maxDefaultJer: 0.2,
      minDefaultRuntimeFactor: 1,
    },
  });

  assert.deepEqual(plainObject(report), {
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'fixture-overlap',
      category: 'overlap-heavy',
      audioPath: '/tmp/fixture.wav',
    },
    referenceEngine: 'human-rttm',
    candidates: [
      {
        engine: 'sherpa-onnx',
        metrics: {
          speakerMapping: { Alice: 'Alice', Bob: 'Bob' },
          totalReferenceSpeakerSeconds: 8,
          overlapReferenceSeconds: 1,
          missedSpeechSeconds: 1,
          falseAlarmSeconds: 0,
          speakerConfusionSeconds: 0,
          diarizationErrorRate: 0.125,
          jaccardErrorRate: 0.125,
        },
        gate: {
          status: 'default_candidate',
          reasons: [],
        },
        practicalMetrics: {
          speakerCount: 2,
          turnCount: 2,
          rejectedTurnCount: 0,
          speechSeconds: 7,
          speakerSeconds: 7,
          overlapRegionSeconds: 0,
          overlapSpeakerSeconds: 0,
          overlapRatio: 0,
          turnsPerMinute: null,
        },
        transcriptReconciliationMetrics: {
          totalSegments: 1,
          timedSegments: 1,
          assignedSegments: 1,
          unassignedSegments: 0,
          missingTimingSegments: 0,
          noOverlapSegments: 0,
          lowCoverageAssignedSegments: 0,
          overlapSegmentCount: 0,
          tieSegmentCount: 0,
          totalTimedSegmentSeconds: 0.5,
          totalAssignedCoverageSeconds: 0.5,
          meanCoverageRatio: 1,
          assignmentReasonCounts: {
            dominant_overlap: 1,
            overlap_tie_earliest_turn: 0,
            missing_audio_timestamps: 0,
            no_diarization_overlap: 0,
          },
        },
        assignedTranscripts: [
          {
            id: 't1',
            text: 'overlap',
            timestamp: '10:00:03',
            audio_start_time: 3.25,
            audio_end_time: 3.75,
            diarization: {
              speaker: 'Alice',
              coverageRatio: 1,
              coverageSeconds: 0.5,
              overlappedSpeakers: [],
              overlapSeconds: 0,
              assignmentReason: 'dominant_overlap',
            },
          },
        ],
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2.4,
        },
      },
      {
        engine: 'pyannote-community-1',
        metrics: {
          speakerMapping: { Alice: 'Alice', Bob: 'Bob' },
          totalReferenceSpeakerSeconds: 8,
          overlapReferenceSeconds: 1,
          missedSpeechSeconds: 1,
          falseAlarmSeconds: 0,
          speakerConfusionSeconds: 0,
          diarizationErrorRate: 0.125,
          jaccardErrorRate: 0.125,
        },
        gate: {
          status: 'optional_candidate',
          reasons: [
            'integration_not_native',
            'license_notice_required',
            'runtime_factor_below_default_gate',
          ],
        },
        practicalMetrics: {
          speakerCount: 2,
          turnCount: 2,
          rejectedTurnCount: 0,
          speechSeconds: 7,
          speakerSeconds: 7,
          overlapRegionSeconds: 0,
          overlapSpeakerSeconds: 0,
          overlapRatio: 0,
          turnsPerMinute: null,
        },
        transcriptReconciliationMetrics: {
          totalSegments: 1,
          timedSegments: 1,
          assignedSegments: 1,
          unassignedSegments: 0,
          missingTimingSegments: 0,
          noOverlapSegments: 0,
          lowCoverageAssignedSegments: 0,
          overlapSegmentCount: 0,
          tieSegmentCount: 0,
          totalTimedSegmentSeconds: 0.5,
          totalAssignedCoverageSeconds: 0.5,
          meanCoverageRatio: 1,
          assignmentReasonCounts: {
            dominant_overlap: 1,
            overlap_tie_earliest_turn: 0,
            missing_audio_timestamps: 0,
            no_diarization_overlap: 0,
          },
        },
        assignedTranscripts: [
          {
            id: 't1',
            text: 'overlap',
            timestamp: '10:00:03',
            audio_start_time: 3.25,
            audio_end_time: 3.75,
            diarization: {
              speaker: 'Alice',
              coverageRatio: 1,
              coverageSeconds: 0.5,
              overlappedSpeakers: [],
              overlapSeconds: 0,
              assignmentReason: 'dominant_overlap',
            },
          },
        ],
        practical: {
          integration: 'python-sidecar',
          localProcessing: true,
          licenseUse: 'gated_model_notice_required',
          runtimeFactor: 0.8,
        },
      },
    ],
    decision: {
      status: 'native_default_candidate_available',
      defaultCandidate: 'sherpa-onnx',
      optionalCandidate: 'pyannote-community-1',
      blockers: [],
    },
  });
});

test('builds an unlabeled bakeoff report with practical metrics but no default decision', () => {
  const report = buildDiarizationBakeoffReport({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'unlabeled-overlap',
      category: 'overlap-heavy',
      audioPath: '/tmp/unlabeled.wav',
    },
    reference: null,
    transcriptSegments: [],
    candidates: [
      {
        output: {
          engine: 'sherpa-onnx',
          audio: {
            path: '/tmp/unlabeled.wav',
            durationSeconds: 10,
          },
          turns: [
            { start: 0, end: 4, speaker: 'SPEAKER_00' },
            { start: 3, end: 5, speaker: 'SPEAKER_01' },
            { start: 6, end: 8, speaker: 'SPEAKER_01' },
          ],
        },
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
    gates: {
      maxDefaultDer: 0.18,
      maxDefaultJer: 0.2,
      minDefaultRuntimeFactor: 1,
    },
  });

  assert.deepEqual(plainObject(report.candidates[0].metrics), null);
  assert.deepEqual(plainObject(report.candidates[0].gate), {
    status: 'fail',
    reasons: ['missing_reference_labels'],
  });
  assert.deepEqual(plainObject(report.candidates[0].practicalMetrics), {
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
  assert.deepEqual(plainObject(report.decision), {
    status: 'no_candidate_passed',
    defaultCandidate: null,
    optionalCandidate: null,
    blockers: ['sherpa-onnx:missing_reference_labels'],
  });
});

test('aggregates labeled corpus reports into a corpus-level engine decision', () => {
  const reports = [
    buildDiarizationBakeoffReport({
      generatedAt: '2026-06-21T12:00:00.000Z',
      corpusItem: {
        id: 'clean-call',
        category: 'clean-2-speaker',
        audioPath: '/tmp/clean.wav',
      },
      reference: {
        engine: 'human-rttm',
        turns: [
          { start: 0, end: 5, speaker: 'Alice' },
          { start: 5, end: 10, speaker: 'Bob' },
        ],
      },
      transcriptSegments: [],
      candidates: [
        {
          output: {
            engine: 'sherpa-onnx',
            turns: [
              { start: 0, end: 5, speaker: 'Alice' },
              { start: 5, end: 10, speaker: 'Bob' },
            ],
          },
          practical: {
            integration: 'native',
            localProcessing: true,
            licenseUse: 'app_default_ok',
            runtimeFactor: 2,
          },
        },
        {
          output: {
            engine: 'pyannote-community-1',
            turns: [
              { start: 0, end: 5, speaker: 'Alice' },
              { start: 5, end: 10, speaker: 'Bob' },
            ],
          },
          practical: {
            integration: 'python-sidecar',
            localProcessing: true,
            licenseUse: 'gated_model_notice_required',
            runtimeFactor: 1.5,
          },
        },
      ],
      gates: {
        maxDefaultDer: 0.18,
        maxDefaultJer: 0.2,
        minDefaultRuntimeFactor: 1,
      },
    }),
    buildDiarizationBakeoffReport({
      generatedAt: '2026-06-21T12:00:00.000Z',
      corpusItem: {
        id: 'overlap-call',
        category: 'overlap-heavy',
        audioPath: '/tmp/overlap.wav',
      },
      reference: {
        engine: 'human-rttm',
        turns: [
          { start: 0, end: 4, speaker: 'Alice' },
          { start: 3, end: 7, speaker: 'Bob' },
        ],
      },
      transcriptSegments: [],
      candidates: [
        {
          output: {
            engine: 'sherpa-onnx',
            turns: [
              { start: 0, end: 4, speaker: 'Alice' },
              { start: 4, end: 7, speaker: 'Bob' },
            ],
          },
          practical: {
            integration: 'native',
            localProcessing: true,
            licenseUse: 'app_default_ok',
            runtimeFactor: 2,
          },
        },
        {
          output: {
            engine: 'pyannote-community-1',
            turns: [
              { start: 0, end: 4, speaker: 'Alice' },
              { start: 3, end: 7, speaker: 'Bob' },
            ],
          },
          practical: {
            integration: 'python-sidecar',
            localProcessing: true,
            licenseUse: 'gated_model_notice_required',
            runtimeFactor: 1.5,
          },
        },
      ],
      gates: {
        maxDefaultDer: 0.18,
        maxDefaultJer: 0.2,
        minDefaultRuntimeFactor: 1,
      },
    }),
  ];

  const corpusReport = buildDiarizationCorpusReport({
    generatedAt: '2026-06-21T13:00:00.000Z',
    requiredCategories: ['clean-2-speaker', 'overlap-heavy'],
    reports,
  });

  assert.deepEqual(plainObject(corpusReport.decision), {
    status: 'native_default_candidate_available',
    defaultCandidate: 'sherpa-onnx',
    optionalCandidate: 'pyannote-community-1',
    blockers: [],
  });
  assert.deepEqual(plainObject(corpusReport.categoryCoverage), [
    {
      category: 'clean-2-speaker',
      status: 'labeled',
      itemIds: ['clean-call'],
    },
    {
      category: 'overlap-heavy',
      status: 'labeled',
      itemIds: ['overlap-call'],
    },
  ]);
  assert.deepEqual(plainObject(corpusReport.candidates.map((candidate) => ({
    engine: candidate.engine,
    status: candidate.status,
    labeledItemCount: candidate.labeledItemCount,
    meanDer: candidate.meanDer,
    maxDer: candidate.maxDer,
  }))), [
    {
      engine: 'pyannote-community-1',
      status: 'optional_candidate',
      labeledItemCount: 2,
      meanDer: 0,
      maxDer: 0,
    },
    {
      engine: 'sherpa-onnx',
      status: 'default_candidate',
      labeledItemCount: 2,
      meanDer: 0.0625,
      maxDer: 0.125,
    },
  ]);
});

test('summarizes real corpus manifest readiness before recordings are approved', () => {
  const report = buildDiarizationCorpusManifestReport({
    requiredCategories: [
      'clean-2-speaker',
      'overlap-heavy',
      'system-audio-heavy',
    ],
    items: [
      {
        id: 'clean-call-001',
        category: 'clean-2-speaker',
        approvalStatus: 'approved',
        audioPath: '/local/clean-call.wav',
        transcriptPath: '/local/clean-call.transcripts.json',
        referenceRttmPath: '/local/clean-call.rttm',
        expectedSpeakerCount: 2,
      },
      {
        id: 'overlap-001',
        category: 'overlap-heavy',
        approvalStatus: 'pending',
        audioPath: '/local/overlap.wav',
        transcriptPath: '/local/overlap.transcripts.json',
        expectedSpeakerCount: {
          min: 2,
          max: 4,
        },
      },
      {
        id: 'system-audio-001',
        category: 'system-audio-heavy',
        approvalStatus: 'approved',
        audioPath: '/local/system.wav',
        transcriptPath: '/local/system.transcripts.json',
      },
    ],
  });

  assert.deepEqual(plainObject(report), {
    requiredCategories: [
      'clean-2-speaker',
      'overlap-heavy',
      'system-audio-heavy',
    ],
    itemCount: 3,
    approvedItemCount: 2,
    pendingApprovalItemCount: 1,
    labeledItemCount: 1,
    transcriptReadyItemCount: 2,
    categoryCoverage: [
      {
        category: 'clean-2-speaker',
        status: 'labeled',
        itemIds: ['clean-call-001'],
        approvedItemIds: ['clean-call-001'],
        labeledItemIds: ['clean-call-001'],
        transcriptItemIds: ['clean-call-001'],
        blockers: [],
      },
      {
        category: 'overlap-heavy',
        status: 'pending_approval',
        itemIds: ['overlap-001'],
        approvedItemIds: [],
        labeledItemIds: [],
        transcriptItemIds: [],
        blockers: [
          'category:overlap-heavy:no_approved_audio',
          'category:overlap-heavy:no_labeled_reference',
          'category:overlap-heavy:no_approved_transcripts',
          'item:overlap-001:approval_pending',
        ],
      },
      {
        category: 'system-audio-heavy',
        status: 'approved_unlabeled',
        itemIds: ['system-audio-001'],
        approvedItemIds: ['system-audio-001'],
        labeledItemIds: [],
        transcriptItemIds: ['system-audio-001'],
        blockers: [
          'category:system-audio-heavy:no_labeled_reference',
        ],
      },
    ],
    readiness: {
      unlabeledBakeoffReady: false,
      labeledDecisionReady: false,
      transcriptReconciliationReady: false,
      blockers: [
        'category:overlap-heavy:no_approved_audio',
        'category:overlap-heavy:no_labeled_reference',
        'category:overlap-heavy:no_approved_transcripts',
        'item:overlap-001:approval_pending',
        'category:system-audio-heavy:no_labeled_reference',
      ],
    },
  });
});

test('corpus aggregation refuses a default decision when required categories are unlabeled or missing', () => {
  const unlabeledReport = buildDiarizationBakeoffReport({
    generatedAt: '2026-06-21T12:00:00.000Z',
    corpusItem: {
      id: 'unlabeled-overlap',
      category: 'overlap-heavy',
      audioPath: '/tmp/unlabeled.wav',
    },
    reference: null,
    transcriptSegments: [],
    candidates: [
      {
        output: {
          engine: 'sherpa-onnx',
          turns: [
            { start: 0, end: 4, speaker: 'SPEAKER_00' },
            { start: 3, end: 5, speaker: 'SPEAKER_01' },
          ],
        },
        practical: {
          integration: 'native',
          localProcessing: true,
          licenseUse: 'app_default_ok',
          runtimeFactor: 2,
        },
      },
    ],
    gates: {
      maxDefaultDer: 0.18,
      maxDefaultJer: 0.2,
      minDefaultRuntimeFactor: 1,
    },
  });

  const corpusReport = buildDiarizationCorpusReport({
    generatedAt: '2026-06-21T13:00:00.000Z',
    requiredCategories: ['overlap-heavy', 'noisy-poor-mic'],
    reports: [unlabeledReport],
  });

  assert.deepEqual(plainObject(corpusReport.decision), {
    status: 'no_candidate_passed',
    defaultCandidate: null,
    optionalCandidate: null,
    blockers: [
      'corpus:unlabeled_category:overlap-heavy',
      'corpus:missing_category:noisy-poor-mic',
    ],
  });
});
