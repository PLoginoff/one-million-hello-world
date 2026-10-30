/**
 * Ensemble Detector — weighted voting over streaming detectors.
 *
 * Each member produces a per-point anomaly score (or null). The
 * ensemble normalises each score to [0,1] via the member's configured
 * `scale` (score/scale, clamped), then combines with weights:
 *
 *   combined = Σ(wᵢ · sᵢ) / Σwᵢ        weighted mean
 *   quorum   = #{i : sᵢ ≥ flagAt} / N  fraction of members flagging
 *
 * A point is anomalous when combined ≥ `threshold` AND quorum ≥
 * `minQuorum` — majority-gated scoring avoids single-detector noise.
 *
 * Weights can be adapted online by `ConceptDriftAdapter`.
 *
 * @module AnomalyDetection/Engine2
 */

import { DataPoint, Anomaly, IStreamingDetector } from '../implementations/detectors/Types';

/** A scored member — adapter over IStreamingDetector returning numbers. */
export interface IScoringDetector {
  readonly name: string;
  /**
   * Returns anomaly score ∈ [0, ∞) for the point; 0/negative = normal.
   * Should NOT reset state.
   */
  score(point: DataPoint): number;
  reset(): void;
}

/** Adapt an IStreamingDetector into a scoring member. */
export class DetectorAdapter implements IScoringDetector {
  readonly name: string;
  constructor(
    private readonly detector: IStreamingDetector,
    /** Score when the detector fires; default 1. */
    private readonly fireScore = 1,
    /** Normalisation scale — a score of `scale` maps to 1. */
    readonly scale = 1
  ) {
    this.name = detector.name;
  }
  score(point: DataPoint): number {
    const a = this.detector.update(point);
    return a === null ? 0 : a.score / this.scale * this.fireScore;
  }
  reset(): void {
    this.detector.reset();
  }
}

export interface EnsembleMember {
  readonly detector: IScoringDetector;
  weight: number;
  /** Score above which the member "votes" the point anomalous. */
  readonly flagAt?: number;
}

export interface EnsembleOptions {
  /** Combined-score threshold in [0,1]. Default 0.5. */
  readonly threshold?: number;
  /** Fraction of members that must flag for an anomaly. Default 0 (off). */
  readonly minQuorum?: number;
}

export interface EnsembleVote {
  readonly detector: string;
  readonly rawScore: number;
  readonly normalized: number;
  readonly weight: number;
  readonly flagged: boolean;
}

export interface EnsembleResult {
  readonly point: DataPoint;
  readonly combined: number;
  readonly quorum: number;
  readonly isAnomaly: boolean;
  readonly votes: readonly EnsembleVote[];
}

export class EnsembleDetector {
  private readonly members: EnsembleMember[] = [];
  private readonly threshold: number;
  private readonly minQuorum: number;

  constructor(options: EnsembleOptions = {}) {
    this.threshold = options.threshold ?? 0.5;
    this.minQuorum = options.minQuorum ?? 0;
  }

  addMember(detector: IScoringDetector, weight = 1, flagAt = 1): void {
    this.members.push({ detector, weight, flagAt });
  }

  removeMember(name: string): boolean {
    const i = this.members.findIndex((m) => m.detector.name === name);
    if (i < 0) return false;
    this.members.splice(i, 1);
    return true;
  }

  /** Score one point through every member. O(#members). */
  update(point: DataPoint): EnsembleResult {
    const votes: EnsembleVote[] = [];
    let wsum = 0;
    let wscore = 0;
    let flagged = 0;
    for (const m of this.members) {
      const raw = m.detector.score(point);
      const normalized = Math.min(1, Math.max(0, raw));
      const flag = normalized >= (m.flagAt ?? 1);
      if (flag) flagged++;
      wsum += m.weight;
      wscore += m.weight * normalized;
      votes.push({
        detector: m.detector.name,
        rawScore: raw,
        normalized,
        weight: m.weight,
        flagged: flag,
      });
    }
    const combined = wsum > 0 ? wscore / wsum : 0;
    const quorum = this.members.length > 0 ? flagged / this.members.length : 0;
    const isAnomaly = combined >= this.threshold && quorum >= this.minQuorum;
    return { point, combined, quorum, isAnomaly, votes };
  }

  /** Current member weights (mutable by drift adapter). */
  memberWeight(name: string): number | undefined {
    return this.members.find((m) => m.detector.name === name)?.weight;
  }

  setMemberWeight(name: string, weight: number): boolean {
    const m = this.members.find((x) => x.detector.name === name);
    if (!m) return false;
    m.weight = weight;
    return true;
  }

  membersList(): readonly { name: string; weight: number }[] {
    return this.members.map((m) => ({ name: m.detector.name, weight: m.weight }));
  }

  reset(): void {
    for (const m of this.members) m.detector.reset();
  }
}

/** Convert an EnsembleResult into the shared Anomaly shape. */
export function toAnomaly(r: EnsembleResult, index = -1): Anomaly {
  const top = [...r.votes].sort((a, b) => b.normalized * b.weight - a.normalized * a.weight)[0];
  return {
    index,
    timestamp: r.point.timestamp,
    value: r.point.value,
    score: r.combined,
    severity: Math.min(1, r.combined),
    detector: 'ensemble',
    explanation: top
      ? `combined ${r.combined.toFixed(2)} (top: ${top.detector}=${top.normalized.toFixed(2)}, quorum=${r.quorum.toFixed(2)})`
      : `combined ${r.combined.toFixed(2)}`,
  };
}
