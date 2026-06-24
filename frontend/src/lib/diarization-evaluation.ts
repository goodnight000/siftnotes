export interface DiarizationTurn {
  start: number;
  end: number;
  speaker: string;
  confidence?: number;
  overlap?: boolean;
}

export interface RejectedDiarizationTurn {
  start: number;
  end: number;
  speaker: string;
  reason: string;
}

export interface DiarizationEngineOutput {
  engine: string;
  engineVersion?: string;
  audio?: {
    path?: string;
    durationSeconds?: number;
    sampleRate?: number;
  };
  turns: DiarizationTurn[];
  rejectedTurns?: RejectedDiarizationTurn[];
}

export interface TranscriptTimingSegment {
  id: string;
  text: string;
  timestamp: string;
  audio_start_time?: number;
  audio_end_time?: number;
  duration?: number;
  [key: string]: unknown;
}

export interface TranscriptDiarizationAssignment {
  speaker: string | null;
  coverageRatio: number;
  coverageSeconds: number;
  overlappedSpeakers: string[];
  overlapSeconds: number;
  assignmentReason:
    | "dominant_overlap"
    | "overlap_tie_earliest_turn"
    | "missing_audio_timestamps"
    | "no_diarization_overlap";
}

export type AssignedTranscriptSegment<T extends TranscriptTimingSegment = TranscriptTimingSegment> =
  T & {
    diarization: TranscriptDiarizationAssignment;
  };

export interface TranscriptReconciliationMetrics {
  totalSegments: number;
  timedSegments: number;
  assignedSegments: number;
  unassignedSegments: number;
  missingTimingSegments: number;
  noOverlapSegments: number;
  lowCoverageAssignedSegments: number;
  overlapSegmentCount: number;
  tieSegmentCount: number;
  totalTimedSegmentSeconds: number;
  totalAssignedCoverageSeconds: number;
  meanCoverageRatio: number | null;
  assignmentReasonCounts: Record<TranscriptDiarizationAssignment["assignmentReason"], number>;
}

export interface DiarizationMetricsInput {
  referenceTurns: DiarizationTurn[];
  hypothesisTurns: DiarizationTurn[];
}

export interface DiarizationMetrics {
  speakerMapping: Record<string, string>;
  totalReferenceSpeakerSeconds: number;
  overlapReferenceSeconds: number;
  missedSpeechSeconds: number;
  falseAlarmSeconds: number;
  speakerConfusionSeconds: number;
  diarizationErrorRate: number;
  jaccardErrorRate: number;
}

export interface ParseRttmInput {
  engine: string;
  engineVersion?: string;
  audioPath?: string;
  durationSeconds?: number;
  sampleRate?: number;
  text: string;
}

export interface DiarizationCandidatePracticalMetadata {
  integration: "native" | "python-sidecar" | "external-command" | "cloud";
  localProcessing: boolean;
  licenseUse: "app_default_ok" | "gated_model_notice_required" | "non_commercial" | "unknown";
  adapterRuntimeSeconds?: number;
  runtimeSeconds?: number;
  runtimeFactor?: number;
  modelSizeMb?: number;
  peakMemoryMb?: number;
  installComplexity?:
    | "native_crate"
    | "native_binary_with_models"
    | "python_sidecar_with_models"
    | "external_command"
    | "unknown";
}

export interface DiarizationCandidateInput {
  output: DiarizationEngineOutput;
  practical: DiarizationCandidatePracticalMetadata;
}

export interface DiarizationBakeoffGates {
  maxDefaultDer: number;
  maxDefaultJer: number;
  minDefaultRuntimeFactor: number;
}

export interface DiarizationCorpusItem {
  id: string;
  category: string;
  audioPath: string;
  durationSeconds?: number;
  sampleRate?: number;
}

export interface DiarizationCandidateGate {
  status: "default_candidate" | "optional_candidate" | "fail";
  reasons: string[];
}

export interface DiarizationBakeoffReport {
  generatedAt: string;
  corpusItem: DiarizationCorpusItem;
  referenceEngine: string | null;
  candidates: Array<{
    engine: string;
    metrics: DiarizationMetrics | null;
    gate: DiarizationCandidateGate;
    practicalMetrics: DiarizationPracticalMetrics;
    transcriptReconciliationMetrics: TranscriptReconciliationMetrics;
    assignedTranscripts: Array<AssignedTranscriptSegment>;
    practical: DiarizationCandidatePracticalMetadata;
  }>;
  decision: {
    status: "native_default_candidate_available" | "optional_candidate_only" | "no_candidate_passed";
    defaultCandidate: string | null;
    optionalCandidate: string | null;
    blockers: string[];
  };
}

type DiarizationBakeoffCandidateReport = DiarizationBakeoffReport["candidates"][number];

function hasDiarizationMetrics(
  candidate: DiarizationBakeoffCandidateReport,
): candidate is DiarizationBakeoffCandidateReport & { metrics: DiarizationMetrics } {
  return candidate.metrics !== null;
}

export interface DiarizationCorpusAggregateInput {
  generatedAt: string;
  requiredCategories: string[];
  reports: DiarizationBakeoffReport[];
}

export interface DiarizationCorpusCoverage {
  category: string;
  status: "labeled" | "unlabeled" | "missing";
  itemIds: string[];
}

export interface DiarizationCorpusCandidateSummary {
  engine: string;
  status: "default_candidate" | "optional_candidate" | "fail";
  itemCount: number;
  labeledItemCount: number;
  unlabeledItemCount: number;
  defaultPassCount: number;
  optionalPassCount: number;
  failCount: number;
  meanDer: number | null;
  maxDer: number | null;
  meanJer: number | null;
  maxJer: number | null;
  meanRuntimeFactor: number | null;
  maxModelSizeMb: number | null;
  maxPeakMemoryMb: number | null;
  blockers: string[];
}

export interface DiarizationCorpusReport {
  generatedAt: string;
  requiredCategories: string[];
  reportCount: number;
  categoryCoverage: DiarizationCorpusCoverage[];
  candidates: DiarizationCorpusCandidateSummary[];
  decision: {
    status: "native_default_candidate_available" | "optional_candidate_only" | "no_candidate_passed";
    defaultCandidate: string | null;
    optionalCandidate: string | null;
    blockers: string[];
  };
}

export type DiarizationCorpusManifestApprovalStatus =
  | "approved"
  | "pending"
  | "not_requested"
  | "rejected";

export interface DiarizationCorpusManifestItem {
  id: string;
  category: string;
  approvalStatus: DiarizationCorpusManifestApprovalStatus;
  audioPath?: string;
  transcriptPath?: string;
  referenceRttmPath?: string;
  expectedSpeakerCount?: number | {
    min?: number;
    max?: number;
  };
  durationSeconds?: number;
  sampleRate?: number;
  notes?: string;
}

export interface DiarizationCorpusManifestCategoryCoverage {
  category: string;
  status: "labeled" | "approved_unlabeled" | "pending_approval" | "missing";
  itemIds: string[];
  approvedItemIds: string[];
  labeledItemIds: string[];
  transcriptItemIds: string[];
  blockers: string[];
}

export interface DiarizationCorpusManifestReport {
  requiredCategories: string[];
  itemCount: number;
  approvedItemCount: number;
  pendingApprovalItemCount: number;
  labeledItemCount: number;
  transcriptReadyItemCount: number;
  categoryCoverage: DiarizationCorpusManifestCategoryCoverage[];
  readiness: {
    unlabeledBakeoffReady: boolean;
    labeledDecisionReady: boolean;
    transcriptReconciliationReady: boolean;
    blockers: string[];
  };
}

export interface DiarizationCorpusManifestInput {
  requiredCategories: string[];
  items: DiarizationCorpusManifestItem[];
}

export interface DiarizationPracticalMetrics {
  speakerCount: number;
  turnCount: number;
  rejectedTurnCount: number;
  speechSeconds: number;
  speakerSeconds: number;
  overlapRegionSeconds: number;
  overlapSpeakerSeconds: number;
  overlapRatio: number | null;
  turnsPerMinute: number | null;
}

const ROUNDING_PRECISION = 1000;
const LOW_TRANSCRIPT_COVERAGE_THRESHOLD = 0.5;

function roundSeconds(value: number): number {
  return Math.round((value + Number.EPSILON) * ROUNDING_PRECISION) / ROUNDING_PRECISION;
}

function roundMetric(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function overlapSeconds(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function orderedSpeakers(turns: DiarizationTurn[]): string[] {
  return sortedUnique(
    [...turns]
      .sort((a, b) => a.start - b.start || a.end - b.end || a.speaker.localeCompare(b.speaker))
      .map((turn) => turn.speaker),
  );
}

function collectBoundaries(...turnSets: DiarizationTurn[][]): number[] {
  const boundaries = new Set<number>();

  for (const turns of turnSets) {
    for (const turn of turns) {
      boundaries.add(turn.start);
      boundaries.add(turn.end);
    }
  }

  return Array.from(boundaries).sort((a, b) => a - b);
}

function activeSpeakers(turns: DiarizationTurn[], start: number, end: number): string[] {
  return sortedUnique(
    turns
      .filter((turn) => overlapSeconds(turn.start, turn.end, start, end) > 0)
      .map((turn) => turn.speaker),
  );
}

export function normalizeDiarizationOutput(output: DiarizationEngineOutput): DiarizationEngineOutput {
  const rejectedTurns: RejectedDiarizationTurn[] = [];
  const duration = output.audio?.durationSeconds;

  const turns = output.turns.flatMap((turn): DiarizationTurn[] => {
    if (!Number.isFinite(turn.start) || !Number.isFinite(turn.end)) {
      rejectedTurns.push({ ...turn, reason: "timestamps_must_be_finite" });
      return [];
    }

    const start = Math.max(0, roundSeconds(turn.start));
    const end = roundSeconds(duration === undefined ? turn.end : Math.min(duration, turn.end));

    if (end <= start) {
      rejectedTurns.push({ ...turn, reason: "end_must_be_after_start" });
      return [];
    }

    return [{
      start,
      end,
      speaker: turn.speaker,
      ...(turn.confidence === undefined ? {} : { confidence: roundSeconds(turn.confidence) }),
      overlap: false,
    }];
  }).sort((a, b) => a.start - b.start || a.end - b.end || a.speaker.localeCompare(b.speaker));

  const turnsWithOverlap = turns.map((turn, index) => ({
    ...turn,
    overlap: turns.some((other, otherIndex) => (
      otherIndex !== index &&
      other.speaker !== turn.speaker &&
      overlapSeconds(turn.start, turn.end, other.start, other.end) > 0
    )),
  }));

  return {
    engine: output.engine,
    ...(output.engineVersion === undefined ? {} : { engineVersion: output.engineVersion }),
    ...(output.audio === undefined ? {} : { audio: output.audio }),
    turns: turnsWithOverlap,
    rejectedTurns,
  };
}

export function parseRttm(input: ParseRttmInput): DiarizationEngineOutput {
  const turns: DiarizationTurn[] = [];

  for (const line of input.text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const fields = trimmed.split(/\s+/);
    if (fields[0] !== "SPEAKER" || fields.length < 8) {
      continue;
    }

    const start = Number(fields[3]);
    const duration = Number(fields[4]);
    const speaker = fields[7];

    turns.push({
      start,
      end: start + duration,
      speaker,
    });
  }

  return normalizeDiarizationOutput({
    engine: input.engine,
    ...(input.engineVersion === undefined ? {} : { engineVersion: input.engineVersion }),
    audio: {
      ...(input.audioPath === undefined ? {} : { path: input.audioPath }),
      ...(input.durationSeconds === undefined ? {} : { durationSeconds: input.durationSeconds }),
      ...(input.sampleRate === undefined ? {} : { sampleRate: input.sampleRate }),
    },
    turns,
  });
}

function cooccurrenceSeconds(
  referenceTurns: DiarizationTurn[],
  hypothesisTurns: DiarizationTurn[],
  referenceSpeaker: string,
  hypothesisSpeaker: string,
): number {
  let total = 0;

  for (const referenceTurn of referenceTurns.filter((turn) => turn.speaker === referenceSpeaker)) {
    for (const hypothesisTurn of hypothesisTurns.filter((turn) => turn.speaker === hypothesisSpeaker)) {
      total += overlapSeconds(
        referenceTurn.start,
        referenceTurn.end,
        hypothesisTurn.start,
        hypothesisTurn.end,
      );
    }
  }

  return total;
}

function bestSpeakerMapping(referenceTurns: DiarizationTurn[], hypothesisTurns: DiarizationTurn[]): Record<string, string> {
  const referenceSpeakers = orderedSpeakers(referenceTurns);
  const hypothesisSpeakers = orderedSpeakers(hypothesisTurns);

  if (referenceSpeakers.length === 0 || hypothesisSpeakers.length === 0) {
    return {};
  }

  type MappingState = {
    score: number;
    mapping: Record<string, string>;
  };

  let states = new Map<number, MappingState>([
    [0, { score: 0, mapping: {} }],
  ]);

  for (const hypothesisSpeaker of hypothesisSpeakers) {
    const nextStates = new Map<number, MappingState>();

    for (const [mask, state] of states.entries()) {
      const existing = nextStates.get(mask);
      if (existing === undefined || state.score > existing.score) {
        nextStates.set(mask, state);
      }

      for (let referenceIndex = 0; referenceIndex < referenceSpeakers.length; referenceIndex += 1) {
        const bit = 1 << referenceIndex;
        if ((mask & bit) !== 0) {
          continue;
        }

        const referenceSpeaker = referenceSpeakers[referenceIndex];
        const score = state.score + cooccurrenceSeconds(
          referenceTurns,
          hypothesisTurns,
          referenceSpeaker,
          hypothesisSpeaker,
        );
        const nextMask = mask | bit;
        const next = nextStates.get(nextMask);

        if (next === undefined || score > next.score) {
          nextStates.set(nextMask, {
            score,
            mapping: {
              ...state.mapping,
              [hypothesisSpeaker]: referenceSpeaker,
            },
          });
        }
      }
    }

    states = nextStates;
  }

  return Array.from(states.values()).reduce<MappingState>(
    (best, state) => (state.score > best.score ? state : best),
    { score: -1, mapping: {} },
  ).mapping;
}

export function computeDiarizationMetrics(input: DiarizationMetricsInput): DiarizationMetrics {
  const referenceTurns = normalizeDiarizationOutput({
    engine: "reference",
    turns: input.referenceTurns,
  }).turns;
  const hypothesisTurns = normalizeDiarizationOutput({
    engine: "hypothesis",
    turns: input.hypothesisTurns,
  }).turns;
  const speakerMapping = bestSpeakerMapping(referenceTurns, hypothesisTurns);
  const boundaries = collectBoundaries(referenceTurns, hypothesisTurns);

  let totalReferenceSpeakerSeconds = 0;
  let overlapReferenceSeconds = 0;
  let missedSpeechSeconds = 0;
  let falseAlarmSeconds = 0;
  let speakerConfusionSeconds = 0;

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const duration = end - start;

    if (duration <= 0) {
      continue;
    }

    const referenceActive = activeSpeakers(referenceTurns, start, end);
    const hypothesisActiveSpeakers = activeSpeakers(hypothesisTurns, start, end);
    const mappedHypothesisActive = hypothesisActiveSpeakers
      .map((speaker) => speakerMapping[speaker])
      .filter((speaker): speaker is string => speaker !== undefined);
    const hypothesisActiveSet = new Set(mappedHypothesisActive);
    const correct = referenceActive.filter((speaker) => hypothesisActiveSet.has(speaker)).length;
    const hypothesisActiveCount = hypothesisActiveSpeakers.length;

    totalReferenceSpeakerSeconds += duration * referenceActive.length;
    if (referenceActive.length > 1) {
      overlapReferenceSeconds += duration;
    }

    missedSpeechSeconds += duration * Math.max(0, referenceActive.length - hypothesisActiveCount);
    falseAlarmSeconds += duration * Math.max(0, hypothesisActiveCount - referenceActive.length);
    speakerConfusionSeconds += duration * Math.max(
      0,
      Math.min(referenceActive.length, hypothesisActiveCount) - correct,
    );
  }

  const jaccardErrorRate = computeJaccardErrorRate(referenceTurns, hypothesisTurns, speakerMapping);
  const diarizationErrorRate = totalReferenceSpeakerSeconds === 0
    ? 0
    : (missedSpeechSeconds + falseAlarmSeconds + speakerConfusionSeconds) / totalReferenceSpeakerSeconds;

  return {
    speakerMapping,
    totalReferenceSpeakerSeconds: roundMetric(totalReferenceSpeakerSeconds),
    overlapReferenceSeconds: roundMetric(overlapReferenceSeconds),
    missedSpeechSeconds: roundMetric(missedSpeechSeconds),
    falseAlarmSeconds: roundMetric(falseAlarmSeconds),
    speakerConfusionSeconds: roundMetric(speakerConfusionSeconds),
    diarizationErrorRate: roundMetric(diarizationErrorRate),
    jaccardErrorRate: roundMetric(jaccardErrorRate),
  };
}

function computeJaccardErrorRate(
  referenceTurns: DiarizationTurn[],
  hypothesisTurns: DiarizationTurn[],
  speakerMapping: Record<string, string>,
): number {
  const referenceSpeakers = orderedSpeakers(referenceTurns);
  const boundaries = collectBoundaries(referenceTurns, hypothesisTurns);

  if (referenceSpeakers.length === 0) {
    return 0;
  }

  let totalError = 0;

  for (const referenceSpeaker of referenceSpeakers) {
    let intersection = 0;
    let union = 0;

    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const start = boundaries[index];
      const end = boundaries[index + 1];
      const duration = end - start;

      if (duration <= 0) {
        continue;
      }

      const referenceActive = activeSpeakers(referenceTurns, start, end).includes(referenceSpeaker);
      const hypothesisActive = activeSpeakers(hypothesisTurns, start, end)
        .some((speaker) => speakerMapping[speaker] === referenceSpeaker);

      if (referenceActive && hypothesisActive) {
        intersection += duration;
      }
      if (referenceActive || hypothesisActive) {
        union += duration;
      }
    }

    totalError += union === 0 ? 0 : 1 - (intersection / union);
  }

  return totalError / referenceSpeakers.length;
}

export function assignSpeakersToTranscriptSegments<T extends TranscriptTimingSegment>({
  transcriptSegments,
  diarizationTurns,
}: {
  transcriptSegments: T[];
  diarizationTurns: DiarizationTurn[];
}): Array<AssignedTranscriptSegment<T>> {
  const normalizedTurns = normalizeDiarizationOutput({
    engine: "assignment",
    turns: diarizationTurns,
  }).turns;

  return transcriptSegments.map((segment) => ({
    ...segment,
    diarization: assignSpeakerToSegment(segment, normalizedTurns),
  }));
}

export function buildDiarizationBakeoffReport({
  generatedAt,
  corpusItem,
  reference,
  transcriptSegments,
  candidates,
  gates,
}: {
  generatedAt: string;
  corpusItem: DiarizationCorpusItem;
  reference?: DiarizationEngineOutput | null;
  transcriptSegments: TranscriptTimingSegment[];
  candidates: DiarizationCandidateInput[];
  gates: DiarizationBakeoffGates;
}): DiarizationBakeoffReport {
  const normalizedReference = reference === undefined || reference === null
    ? null
    : normalizeDiarizationOutput(reference);
  const candidateReports = candidates.map((candidate) => {
    const normalizedCandidate = normalizeDiarizationOutput(candidate.output);
    const metrics = normalizedReference === null
      ? null
      : computeDiarizationMetrics({
        referenceTurns: normalizedReference.turns,
        hypothesisTurns: normalizedCandidate.turns,
      });
    const assignedTranscripts = assignSpeakersToTranscriptSegments({
      transcriptSegments,
      diarizationTurns: normalizedCandidate.turns,
    });

    return {
      engine: normalizedCandidate.engine,
      metrics,
      gate: evaluateCandidateGate(metrics, candidate.practical, gates),
      practicalMetrics: computePracticalMetrics(normalizedCandidate),
      transcriptReconciliationMetrics: computeTranscriptReconciliationMetrics(assignedTranscripts),
      assignedTranscripts,
      practical: candidate.practical,
    };
  });

  const defaultCandidates = candidateReports
    .filter(hasDiarizationMetrics)
    .filter((candidate) => candidate.gate.status === "default_candidate")
    .sort((a, b) => a.metrics.diarizationErrorRate - b.metrics.diarizationErrorRate);
  const optionalCandidates = candidateReports
    .filter(hasDiarizationMetrics)
    .filter((candidate) => candidate.gate.status === "optional_candidate")
    .sort((a, b) => a.metrics.diarizationErrorRate - b.metrics.diarizationErrorRate);

  const defaultCandidate = defaultCandidates[0]?.engine ?? null;
  const optionalCandidate = optionalCandidates[0]?.engine ?? null;
  const blockers = defaultCandidate === null
    ? candidateReports.flatMap((candidate) => (
      candidate.gate.status === "fail"
        ? candidate.gate.reasons.map((reason) => `${candidate.engine}:${reason}`)
        : []
    ))
    : [];

  return {
    generatedAt,
    corpusItem,
    referenceEngine: normalizedReference?.engine ?? null,
    candidates: candidateReports,
    decision: {
      status: defaultCandidate !== null
        ? "native_default_candidate_available"
        : optionalCandidate !== null
          ? "optional_candidate_only"
          : "no_candidate_passed",
      defaultCandidate,
      optionalCandidate,
      blockers,
    },
  };
}

export function buildDiarizationCorpusReport({
  generatedAt,
  requiredCategories,
  reports,
}: DiarizationCorpusAggregateInput): DiarizationCorpusReport {
  const categoryCoverage = requiredCategories.map((category) => {
    const matchingReports = reports.filter((report) => report.corpusItem.category === category);
    const hasLabeledReport = matchingReports.some((report) => report.referenceEngine !== null);

    return {
      category,
      status: matchingReports.length === 0
        ? "missing" as const
        : hasLabeledReport
          ? "labeled" as const
          : "unlabeled" as const,
      itemIds: matchingReports.map((report) => report.corpusItem.id).sort((a, b) => a.localeCompare(b)),
    };
  });
  const corpusBlockers = categoryCoverage.flatMap((coverage) => {
    if (coverage.status === "missing") {
      return [`corpus:missing_category:${coverage.category}`];
    }
    if (coverage.status === "unlabeled") {
      return [`corpus:unlabeled_category:${coverage.category}`];
    }
    return [];
  });
  const candidateSummaries = summarizeCorpusCandidates(reports, requiredCategories, corpusBlockers);
  const defaultCandidates = corpusBlockers.length === 0
    ? candidateSummaries
      .filter((candidate) => candidate.status === "default_candidate")
      .sort(compareCorpusCandidates)
    : [];
  const optionalCandidates = corpusBlockers.length === 0
    ? candidateSummaries
      .filter((candidate) => candidate.status === "optional_candidate")
      .sort(compareCorpusCandidates)
    : [];
  const defaultCandidate = defaultCandidates[0]?.engine ?? null;
  const optionalCandidate = optionalCandidates[0]?.engine ?? null;

  return {
    generatedAt,
    requiredCategories,
    reportCount: reports.length,
    categoryCoverage,
    candidates: candidateSummaries,
    decision: {
      status: defaultCandidate !== null
        ? "native_default_candidate_available"
        : optionalCandidate !== null
          ? "optional_candidate_only"
          : "no_candidate_passed",
      defaultCandidate,
      optionalCandidate,
      blockers: defaultCandidate === null && optionalCandidate === null
        ? corpusBlockers
        : [],
    },
  };
}

export function buildDiarizationCorpusManifestReport({
  requiredCategories,
  items,
}: DiarizationCorpusManifestInput): DiarizationCorpusManifestReport {
  const categoryCoverage = requiredCategories.map((category) => {
    const matchingItems = items
      .filter((item) => item.category === category)
      .sort((a, b) => a.id.localeCompare(b.id));
    const approvedItems = matchingItems.filter((item) => isApprovedManifestItemWithAudio(item));
    const labeledItems = approvedItems.filter((item) => hasNonEmptyString(item.referenceRttmPath));
    const transcriptReadyItems = approvedItems.filter((item) => hasNonEmptyString(item.transcriptPath));
    const categoryBlockers: string[] = [];

    if (matchingItems.length === 0) {
      categoryBlockers.push(`category:${category}:missing`);
    }
    if (approvedItems.length === 0) {
      categoryBlockers.push(`category:${category}:no_approved_audio`);
    }
    if (labeledItems.length === 0) {
      categoryBlockers.push(`category:${category}:no_labeled_reference`);
    }
    if (transcriptReadyItems.length === 0) {
      categoryBlockers.push(`category:${category}:no_approved_transcripts`);
    }

    if (approvedItems.length === 0) {
      categoryBlockers.push(...matchingItems.flatMap((item) => manifestItemApprovalBlockers(item)));
    }

    return {
      category,
      status: manifestCategoryStatus(matchingItems.length, approvedItems.length, labeledItems.length),
      itemIds: matchingItems.map((item) => item.id),
      approvedItemIds: approvedItems.map((item) => item.id),
      labeledItemIds: labeledItems.map((item) => item.id),
      transcriptItemIds: transcriptReadyItems.map((item) => item.id),
      blockers: categoryBlockers,
    };
  });
  const readinessBlockers = categoryCoverage.flatMap((coverage) => coverage.blockers);
  const approvedItems = items.filter((item) => isApprovedManifestItemWithAudio(item));
  const labeledItems = approvedItems.filter((item) => hasNonEmptyString(item.referenceRttmPath));
  const transcriptReadyItems = approvedItems.filter((item) => hasNonEmptyString(item.transcriptPath));

  return {
    requiredCategories,
    itemCount: items.length,
    approvedItemCount: approvedItems.length,
    pendingApprovalItemCount: items.filter((item) => item.approvalStatus === "pending").length,
    labeledItemCount: labeledItems.length,
    transcriptReadyItemCount: transcriptReadyItems.length,
    categoryCoverage,
    readiness: {
      unlabeledBakeoffReady: categoryCoverage.every((coverage) => coverage.approvedItemIds.length > 0),
      labeledDecisionReady: categoryCoverage.every((coverage) => coverage.labeledItemIds.length > 0),
      transcriptReconciliationReady: categoryCoverage.every((coverage) => coverage.transcriptItemIds.length > 0),
      blockers: readinessBlockers,
    },
  };
}

function manifestCategoryStatus(
  itemCount: number,
  approvedItemCount: number,
  labeledItemCount: number,
): DiarizationCorpusManifestCategoryCoverage["status"] {
  if (labeledItemCount > 0) {
    return "labeled";
  }
  if (approvedItemCount > 0) {
    return "approved_unlabeled";
  }
  if (itemCount > 0) {
    return "pending_approval";
  }
  return "missing";
}

function manifestItemApprovalBlockers(item: DiarizationCorpusManifestItem): string[] {
  if (item.approvalStatus === "approved" && !hasNonEmptyString(item.audioPath)) {
    return [`item:${item.id}:missing_audio_path`];
  }
  if (item.approvalStatus === "pending") {
    return [`item:${item.id}:approval_pending`];
  }
  if (item.approvalStatus === "not_requested") {
    return [`item:${item.id}:approval_not_requested`];
  }
  if (item.approvalStatus === "rejected") {
    return [`item:${item.id}:approval_rejected`];
  }
  return [];
}

function isApprovedManifestItemWithAudio(item: DiarizationCorpusManifestItem): boolean {
  return item.approvalStatus === "approved" && hasNonEmptyString(item.audioPath);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function summarizeCorpusCandidates(
  reports: DiarizationBakeoffReport[],
  requiredCategories: string[],
  corpusBlockers: string[],
): DiarizationCorpusCandidateSummary[] {
  const engines = sortedUnique(
    reports.flatMap((report) => report.candidates.map((candidate) => candidate.engine)),
  );

  return engines.map((engine) => summarizeCorpusCandidate(engine, reports, requiredCategories, corpusBlockers))
    .sort((a, b) => a.engine.localeCompare(b.engine));
}

function summarizeCorpusCandidate(
  engine: string,
  reports: DiarizationBakeoffReport[],
  requiredCategories: string[],
  corpusBlockers: string[],
): DiarizationCorpusCandidateSummary {
  const appearances = reports.flatMap((report) => {
    const candidate = report.candidates.find((entry) => entry.engine === engine);
    return candidate === undefined
      ? []
      : [{
        report,
        candidate,
      }];
  });
  const labeledAppearances = appearances.filter((entry) => entry.candidate.metrics !== null);
  const unlabeledAppearances = appearances.filter((entry) => entry.candidate.metrics === null);
  const defaultPassCount = appearances.filter((entry) => entry.candidate.gate.status === "default_candidate").length;
  const optionalPassCount = appearances.filter((entry) => entry.candidate.gate.status === "optional_candidate").length;
  const failCount = appearances.filter((entry) => entry.candidate.gate.status === "fail").length;
  const presentLabeledCategories = sortedUnique(
    labeledAppearances.map((entry) => entry.report.corpusItem.category),
  );
  const missingCandidateCategories = requiredCategories.filter(
    (category) => !presentLabeledCategories.includes(category),
  );
  const gateBlockers = appearances.flatMap((entry) => (
    entry.candidate.gate.status === "fail"
      ? entry.candidate.gate.reasons.map((reason) => `${entry.report.corpusItem.id}:${reason}`)
      : []
  ));
  const blockers = sortedUnique([
    ...corpusBlockers,
    ...missingCandidateCategories.map((category) => `${engine}:missing_labeled_category:${category}`),
    ...gateBlockers.map((reason) => `${engine}:${reason}`),
  ]);
  const hasOptionalReason = appearances.some((entry) => entry.candidate.gate.status === "optional_candidate");

  return {
    engine,
    status: blockers.length > 0
      ? "fail"
      : hasOptionalReason
        ? "optional_candidate"
        : "default_candidate",
    itemCount: appearances.length,
    labeledItemCount: labeledAppearances.length,
    unlabeledItemCount: unlabeledAppearances.length,
    defaultPassCount,
    optionalPassCount,
    failCount,
    meanDer: meanMetric(labeledAppearances.map((entry) => entry.candidate.metrics?.diarizationErrorRate)),
    maxDer: maxMetric(labeledAppearances.map((entry) => entry.candidate.metrics?.diarizationErrorRate)),
    meanJer: meanMetric(labeledAppearances.map((entry) => entry.candidate.metrics?.jaccardErrorRate)),
    maxJer: maxMetric(labeledAppearances.map((entry) => entry.candidate.metrics?.jaccardErrorRate)),
    meanRuntimeFactor: meanMetric(appearances.map((entry) => entry.candidate.practical.runtimeFactor)),
    maxModelSizeMb: maxMetric(appearances.map((entry) => entry.candidate.practical.modelSizeMb)),
    maxPeakMemoryMb: maxMetric(appearances.map((entry) => entry.candidate.practical.peakMemoryMb)),
    blockers,
  };
}

function compareCorpusCandidates(
  a: DiarizationCorpusCandidateSummary,
  b: DiarizationCorpusCandidateSummary,
): number {
  return (a.meanDer ?? Number.POSITIVE_INFINITY) - (b.meanDer ?? Number.POSITIVE_INFINITY) ||
    (a.meanJer ?? Number.POSITIVE_INFINITY) - (b.meanJer ?? Number.POSITIVE_INFINITY) ||
    a.engine.localeCompare(b.engine);
}

function meanMetric(values: Array<number | null | undefined>): number | null {
  const finiteValues = values.filter((value): value is number => (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value)
  ));

  if (finiteValues.length === 0) {
    return null;
  }

  return roundMetric(finiteValues.reduce((total, value) => total + value, 0) / finiteValues.length);
}

function maxMetric(values: Array<number | null | undefined>): number | null {
  const finiteValues = values.filter((value): value is number => (
    value !== null &&
    value !== undefined &&
    Number.isFinite(value)
  ));

  if (finiteValues.length === 0) {
    return null;
  }

  return roundMetric(Math.max(...finiteValues));
}

function evaluateCandidateGate(
  metrics: DiarizationMetrics | null,
  practical: DiarizationCandidatePracticalMetadata,
  gates: DiarizationBakeoffGates,
): DiarizationCandidateGate {
  const reasons: string[] = [];
  const failReasons: string[] = [];

  if (metrics === null) {
    failReasons.push("missing_reference_labels");
  }
  if (metrics !== null && metrics.diarizationErrorRate > gates.maxDefaultDer) {
    failReasons.push("der_above_default_gate");
  }
  if (metrics !== null && metrics.jaccardErrorRate > gates.maxDefaultJer) {
    failReasons.push("jer_above_default_gate");
  }
  if (!practical.localProcessing) {
    failReasons.push("not_local_processing");
  }
  if (practical.licenseUse === "non_commercial") {
    failReasons.push("license_not_app_default_safe");
  }

  if (failReasons.length > 0) {
    return {
      status: "fail",
      reasons: failReasons,
    };
  }

  if (practical.integration !== "native") {
    reasons.push("integration_not_native");
  }
  if (practical.licenseUse !== "app_default_ok") {
    reasons.push("license_notice_required");
  }
  if (
    practical.runtimeFactor !== undefined &&
    practical.runtimeFactor < gates.minDefaultRuntimeFactor
  ) {
    reasons.push("runtime_factor_below_default_gate");
  }

  return {
    status: reasons.length === 0 ? "default_candidate" : "optional_candidate",
    reasons,
  };
}

export function computePracticalMetrics(output: DiarizationEngineOutput): DiarizationPracticalMetrics {
  const normalizedOutput = normalizeDiarizationOutput(output);
  const turns = normalizedOutput.turns;
  const boundaries = collectBoundaries(turns);

  let speechSeconds = 0;
  let speakerSeconds = 0;
  let overlapRegionSeconds = 0;
  let overlapSpeakerSeconds = 0;

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    const duration = end - start;

    if (duration <= 0) {
      continue;
    }

    const active = activeSpeakers(turns, start, end);
    if (active.length > 0) {
      speechSeconds += duration;
      speakerSeconds += duration * active.length;
    }
    if (active.length > 1) {
      overlapRegionSeconds += duration;
      overlapSpeakerSeconds += duration * active.length;
    }
  }

  const durationSeconds = normalizedOutput.audio?.durationSeconds;
  const hasAudioDuration = durationSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds > 0;
  const overlapRatioDenominator = hasAudioDuration ? durationSeconds : speechSeconds;

  return {
    speakerCount: orderedSpeakers(turns).length,
    turnCount: turns.length,
    rejectedTurnCount: normalizedOutput.rejectedTurns?.length ?? 0,
    speechSeconds: roundMetric(speechSeconds),
    speakerSeconds: roundMetric(speakerSeconds),
    overlapRegionSeconds: roundMetric(overlapRegionSeconds),
    overlapSpeakerSeconds: roundMetric(overlapSpeakerSeconds),
    overlapRatio: overlapRatioDenominator > 0
      ? roundMetric(overlapRegionSeconds / overlapRatioDenominator)
      : null,
    turnsPerMinute: hasAudioDuration
      ? roundMetric(turns.length / (durationSeconds / 60))
      : null,
  };
}

export function computeTranscriptReconciliationMetrics(
  assignedSegments: Array<AssignedTranscriptSegment>,
): TranscriptReconciliationMetrics {
  const assignmentReasonCounts: Record<TranscriptDiarizationAssignment["assignmentReason"], number> = {
    dominant_overlap: 0,
    overlap_tie_earliest_turn: 0,
    missing_audio_timestamps: 0,
    no_diarization_overlap: 0,
  };
  let timedSegments = 0;
  let assignedSegmentCount = 0;
  let missingTimingSegments = 0;
  let noOverlapSegments = 0;
  let lowCoverageAssignedSegments = 0;
  let overlapSegmentCount = 0;
  let tieSegmentCount = 0;
  let totalTimedSegmentSeconds = 0;
  let totalAssignedCoverageSeconds = 0;
  let coverageRatioTotal = 0;

  for (const segment of assignedSegments) {
    const assignment = segment.diarization;
    assignmentReasonCounts[assignment.assignmentReason] += 1;

    if (assignment.assignmentReason === "missing_audio_timestamps") {
      missingTimingSegments += 1;
    } else {
      timedSegments += 1;
      totalTimedSegmentSeconds += segmentDurationSeconds(segment);
      coverageRatioTotal += assignment.coverageRatio;
    }

    if (assignment.speaker === null) {
      if (assignment.assignmentReason === "no_diarization_overlap") {
        noOverlapSegments += 1;
      }
    } else {
      assignedSegmentCount += 1;
      totalAssignedCoverageSeconds += assignment.coverageSeconds;

      if (assignment.coverageRatio < LOW_TRANSCRIPT_COVERAGE_THRESHOLD) {
        lowCoverageAssignedSegments += 1;
      }
    }

    if (assignment.overlapSeconds > 0 || assignment.overlappedSpeakers.length > 1) {
      overlapSegmentCount += 1;
    }
    if (assignment.assignmentReason === "overlap_tie_earliest_turn") {
      tieSegmentCount += 1;
    }
  }

  return {
    totalSegments: assignedSegments.length,
    timedSegments,
    assignedSegments: assignedSegmentCount,
    unassignedSegments: assignedSegments.length - assignedSegmentCount,
    missingTimingSegments,
    noOverlapSegments,
    lowCoverageAssignedSegments,
    overlapSegmentCount,
    tieSegmentCount,
    totalTimedSegmentSeconds: roundMetric(totalTimedSegmentSeconds),
    totalAssignedCoverageSeconds: roundMetric(totalAssignedCoverageSeconds),
    meanCoverageRatio: timedSegments === 0 ? null : roundMetric(coverageRatioTotal / timedSegments),
    assignmentReasonCounts,
  };
}

function segmentDurationSeconds(segment: TranscriptTimingSegment): number {
  if (
    segment.audio_start_time !== undefined &&
    segment.audio_end_time !== undefined &&
    segment.audio_end_time > segment.audio_start_time
  ) {
    return segment.audio_end_time - segment.audio_start_time;
  }

  if (segment.duration !== undefined && Number.isFinite(segment.duration) && segment.duration > 0) {
    return segment.duration;
  }

  return 0;
}

function assignSpeakerToSegment(
  segment: TranscriptTimingSegment,
  turns: DiarizationTurn[],
): TranscriptDiarizationAssignment {
  const start = segment.audio_start_time;
  const end = segment.audio_end_time ?? (
    segment.audio_start_time !== undefined && segment.duration !== undefined
      ? segment.audio_start_time + segment.duration
      : undefined
  );

  if (start === undefined || end === undefined || end <= start) {
    return emptyAssignment("missing_audio_timestamps");
  }

  const segmentDuration = end - start;
  const speakerCoverage = new Map<string, { seconds: number; earliestStart: number }>();

  for (const turn of turns) {
    const seconds = overlapSeconds(start, end, turn.start, turn.end);
    if (seconds === 0) {
      continue;
    }

    const previous = speakerCoverage.get(turn.speaker);
    speakerCoverage.set(turn.speaker, {
      seconds: (previous?.seconds ?? 0) + seconds,
      earliestStart: Math.min(previous?.earliestStart ?? turn.start, turn.start),
    });
  }

  if (speakerCoverage.size === 0) {
    return emptyAssignment("no_diarization_overlap");
  }

  const ranked = Array.from(speakerCoverage.entries())
    .sort((a, b) => (
      b[1].seconds - a[1].seconds ||
      a[1].earliestStart - b[1].earliestStart ||
      a[0].localeCompare(b[0])
    ));
  const topCoverage = ranked[0][1].seconds;
  const tiedTop = ranked.filter(([, coverage]) => coverage.seconds === topCoverage);
  const overlapSecondsValue = computeSegmentOverlapSeconds(start, end, turns);
  const overlappedSpeakers = overlapSecondsValue > 0
    ? Array.from(speakerCoverage.keys()).sort((a, b) => a.localeCompare(b))
    : [];

  return {
    speaker: ranked[0][0],
    coverageRatio: roundMetric(topCoverage / segmentDuration),
    coverageSeconds: roundMetric(topCoverage),
    overlappedSpeakers,
    overlapSeconds: roundMetric(overlapSecondsValue),
    assignmentReason: tiedTop.length > 1 && overlappedSpeakers.length > 1
      ? "overlap_tie_earliest_turn"
      : "dominant_overlap",
  };
}

function computeSegmentOverlapSeconds(start: number, end: number, turns: DiarizationTurn[]): number {
  const clippedTurns = turns
    .filter((turn) => overlapSeconds(start, end, turn.start, turn.end) > 0)
    .map((turn) => ({
      ...turn,
      start: Math.max(start, turn.start),
      end: Math.min(end, turn.end),
    }));
  const boundaries = collectBoundaries(clippedTurns);
  let total = 0;

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const windowStart = boundaries[index];
    const windowEnd = boundaries[index + 1];
    const activeCount = activeSpeakers(clippedTurns, windowStart, windowEnd).length;

    if (activeCount > 1) {
      total += windowEnd - windowStart;
    }
  }

  return total;
}

function emptyAssignment(
  assignmentReason: TranscriptDiarizationAssignment["assignmentReason"],
): TranscriptDiarizationAssignment {
  return {
    speaker: null,
    coverageRatio: 0,
    coverageSeconds: 0,
    overlappedSpeakers: [],
    overlapSeconds: 0,
    assignmentReason,
  };
}
