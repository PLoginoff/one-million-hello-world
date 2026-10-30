/**
 * Canary Deploy — Decision Engine (engine2 facade)
 *
 * Composes the engine2 components into a per-rollout decision loop:
 *
 *   metrics ──> MultiMetricAnalyzer ──> CombinedVerdict
 *        │                                 │
 *        │            ┌────────────────────┼────────────────────┐
 *        │            ▼                    ▼                    ▼
 *        │     RollbackTriggerEngine  PromotionGateController  history
 *        │            │                    │
 *        ▼            ▼                    ▼
 *   decide() → 'continue' | 'rollback' | 'promote' | 'awaiting-approval'
 *
 * `decide()` is the single entry point per analysis window:
 *  1. produce the combined verdict,
 *  2. feed it to the rollback triggers — a decision short-circuits,
 *  3. feed it to the promotion gates,
 *  4. if the canary stage is complete (caller passes `stageComplete`),
 *     report 'promote' when all gates pass, else 'awaiting-approval'.
 *
 * The engine never moves traffic itself — it emits recommendations;
 * the deployment controller owns weights.
 *
 * @module CanaryDeploy/Engine2
 */

import { MultiMetricAnalyzer } from './MultiMetricVerdict';
import { RollbackTriggerEngine } from './RollbackTriggerEngine';
import { PromotionGateController } from './PromotionGateController';
import {
  CombinedVerdict,
  Engine2Clock,
  MetricSample,
  MetricTolerance,
  PromotionGate,
  RollbackDecision,
  RollbackTrigger,
} from './CanaryEngine2Types';

export type CanaryRecommendation =
  | { readonly action: 'continue'; readonly verdict: CombinedVerdict }
  | { readonly action: 'rollback'; readonly verdict: CombinedVerdict; readonly decision: RollbackDecision }
  | { readonly action: 'promote'; readonly verdict: CombinedVerdict }
  | { readonly action: 'awaiting-approval'; readonly verdict: CombinedVerdict; readonly blocking: string };

export interface CanaryDecisionEngineOptions {
  readonly tolerances: ReadonlyArray<MetricTolerance>;
  readonly triggers: ReadonlyArray<RollbackTrigger>;
  readonly gates: ReadonlyArray<PromotionGate>;
  readonly clock?: Engine2Clock;
  readonly windowMs?: number;
  readonly errorMetrics?: ReadonlyArray<{ metric: string; errorThreshold?: number }>;
}

export class CanaryDecisionEngine {
  readonly analyzer: MultiMetricAnalyzer;
  readonly triggers: RollbackTriggerEngine;
  readonly gates: PromotionGateController;
  private readonly _clock: Engine2Clock;
  private readonly _verdicts: CombinedVerdict[] = [];

  constructor(options: CanaryDecisionEngineOptions) {
    this._clock = options.clock ?? Date.now;
    this.analyzer = new MultiMetricAnalyzer(options.tolerances, {
      clock: this._clock,
      windowMs: options.windowMs,
      errorMetrics: options.errorMetrics,
    });
    this.triggers = new RollbackTriggerEngine(options.triggers, { clock: this._clock });
    this.gates = new PromotionGateController(options.gates, { clock: this._clock });
  }

  /** Feed a metric observation. */
  record(sample: MetricSample): void {
    this.analyzer.record(sample);
  }

  get verdictHistory(): ReadonlyArray<CombinedVerdict> {
    return this._verdicts;
  }

  /**
   * Run one analysis window.
   * `stageComplete` = the canary has finished its final step and is up for
   * promotion; otherwise the recommendation can only be continue/rollback.
   */
  decide(stageComplete = false): CanaryRecommendation {
    const verdict = this.analyzer.evaluate(this._clock());
    this._verdicts.push(verdict);

    const rollback = this.triggers.evaluate(verdict);
    if (rollback) {
      return { action: 'rollback', verdict, decision: rollback };
    }

    this.gates.record(verdict);

    if (!stageComplete) {
      return { action: 'continue', verdict };
    }
    if (this.gates.canPromote()) {
      return { action: 'promote', verdict };
    }
    return { action: 'awaiting-approval', verdict, blocking: this.gates.blockingReason() };
  }

  /** Approve a manual promotion gate. */
  approve(gateName: string, actor: string): void {
    this.gates.approve(gateName, actor);
  }

  reset(): void {
    this.analyzer.reset();
    this.triggers.reset();
    this.gates.reset();
    this._verdicts.length = 0;
  }
}
