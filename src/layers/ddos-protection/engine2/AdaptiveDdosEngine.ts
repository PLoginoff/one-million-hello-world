/**
 * Adaptive DDoS Engine — façade over the four engine2 components.
 *
 * Per assessment window the pipeline is:
 *
 *   TrafficSample ─▶ AdaptiveThresholdTuner.observe   (anomalous? learn?)
 *                 ─▶ AttackClassifier.classify         (what is it?)
 *                 ─▶ MitigationPlaybookEngine.evaluate (what do we do?)
 *   IpObservation[] ─▶ TrafficScorer.observe           (who is it?)
 *
 * The tuner deliberately *does not learn* from anomalous windows — an
 * attack must not raise the baseline it is being measured against.
 *
 * @module DdosProtectionLayer/Engine2
 */

import { AdaptiveThresholdTuner } from './AdaptiveThresholdTuner';
import { AttackClassifier } from './AttackClassifier';
import { MitigationPlaybookEngine } from './MitigationPlaybook';
import { TrafficScorer } from './TrafficScorer';
import {
  AttackClass,
  AttackEvidence,
  ClassificationResult,
  IClock,
  IpObservation,
  MitigationStatus,
  SystemClock,
  TrafficSample,
} from './types';

export interface AssessmentResult {
  /** Metrics that breached their adaptive threshold this window. */
  readonly anomalousMetrics: readonly string[];
  /** Whether the baseline accepted this window for learning. */
  readonly baselineUpdated: boolean;
  readonly evidence: AttackEvidence;
  readonly classification: ClassificationResult;
  readonly mitigation: MitigationStatus;
}

export class AdaptiveDdosEngine {
  readonly tuner: AdaptiveThresholdTuner;
  readonly classifier: AttackClassifier;
  readonly mitigations: MitigationPlaybookEngine;
  readonly scorer: TrafficScorer;

  private readonly _clock: IClock;
  private readonly _windowMs: number;
  private readonly _pending: TrafficSample[] = [];

  constructor(opts: { clock?: IClock; windowMs?: number } = {}) {
    this._clock = opts.clock ?? new SystemClock();
    this._windowMs = opts.windowMs ?? 60_000;
    this.tuner = new AdaptiveThresholdTuner({}, this._clock);
    this.classifier = new AttackClassifier();
    this.mitigations = new MitigationPlaybookEngine({}, this._clock);
    this.scorer = new TrafficScorer({}, this._clock);
  }

  /**
   * Buffer a sample into the current assessment window. Call
   * {@link assess} at the window boundary.
   */
  ingest(sample: TrafficSample): void {
    this._pending.push(sample);
  }

  /**
   * Run the full pipeline over the buffered window and clear it.
   * `distinctTargets` — distinct paths/hosts hit (needs L7 visibility
   * upstream); `ipObs` — per-IP observations for the risk scorer.
   */
  assess(distinctTargets = 0, ipObs: readonly IpObservation[] = []): AssessmentResult {
    const samples = this._pending.splice(0, this._pending.length);

    // 1. Thresholds — decide anomalous + learn if normal.
    let anomalous = new Set<string>();
    let learned = false;
    for (const s of samples) {
      const r = this.tuner.observe(s);
      for (const m of r.anomalous) anomalous.add(m);
      if (r.learned) learned = true;
    }

    // 2. Classify — only meaningful with evidence; classify regardless so
    //    low-confidence windows return `unknown` honestly.
    const evidence = this.classifier.buildEvidence(samples, this._windowMs, distinctTargets);
    const classification = this.classifier.classify(evidence);

    // 3. Mitigate — an attack counts as "active" when thresholds fired
    //    *and* the classifier saw a real signature (avoids escalating on
    //    a lone traffic spike).
    const attackActive =
      anomalous.size > 0 && classification.attackClass !== AttackClass.Unknown;
    const mitigation = this.mitigations.evaluate(classification.attackClass, attackActive);

    // 4. Score — per-IP risk for the dashboard.
    if (ipObs.length > 0) this.scorer.observe(ipObs);

    return {
      anomalousMetrics: [...anomalous],
      baselineUpdated: learned,
      evidence,
      classification,
      mitigation,
    };
  }

  /** Buffered-sample count waiting for the next assess(). */
  pendingSamples(): number {
    return this._pending.length;
  }
}
