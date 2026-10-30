/**
 * Concept-Drift Adaptation — reweight ensemble members on distribution
 * shift.
 *
 * Complements `implementations/drift/DriftDetectors` (which *detect* the
 * shift) — this module *adapts* to it:
 *
 *   - Each member maintains a running estimate of its recent accuracy
 *     proxy. Ground truth is usually unavailable online, so we use a
 *     **disagreement-vs-consensus** proxy: a member that persistently
 *     disagrees with the ensemble's decision is assumed to have drifted
 *     out of sync (its weights decay).
 *   - On each point we record whether each member flagged, and whether
 *     the ensemble flagged. Agreement is accumulated with exponential
 *     forgetting (EWMA), mirroring weighted-majority / Winnow dynamics.
 *   - Member weight = baseWeight × agreementRate^γ (γ = strictness).
 *   - When the *stream itself* drifts (detected via an injected
 *     `IDriftMonitor`, e.g. Page-Hinkley), all members are soft-reset
 *     (weights re-normalised toward uniform) — nobody's baseline is
 *     trusted after a shift.
 *
 * @module AnomalyDetection/Engine2
 */

import { DataPoint } from '../implementations/detectors/Types';
import { EnsembleDetector, EnsembleResult } from './Ensemble';

/** Minimal drift-signal seam — implement with Page-Hinkley, ADWIN, etc. */
export interface IDriftMonitor {
  /** Returns true when a distribution shift is detected at this point. */
  observe(point: DataPoint): boolean;
  reset(): void;
}

export interface AdaptationOptions {
  /** Forgetting rate for agreement EWMA — higher = faster adaptation.
   *  Default 0.05. */
  readonly learningRate?: number;
  /** Exponent shaping agreement → weight. 0 = ignore agreement
   *  (constant weights), 1 = linear, 2 = harsh. Default 1. */
  readonly strictness?: number;
  /** Minimum weight floor — never fully zero a member. Default 0.05. */
  readonly weightFloor?: number;
  /** On drift, blend weights this far toward uniform (0..1).
   *  Default 0.5. */
  readonly driftResetBlend?: number;
}

interface MemberState {
  name: string;
  /** EWMA of agreement with ensemble decision. */
  agreement: number;
  updates: number;
}

export class ConceptDriftAdapter {
  private readonly states = new Map<string, MemberState>();
  private readonly lr: number;
  private readonly strictness: number;
  private readonly floor: number;
  private readonly resetBlend: number;
  private driftEvents = 0;

  constructor(
    private readonly ensemble: EnsembleDetector,
    private readonly driftMonitor?: IDriftMonitor,
    options: AdaptationOptions = {}
  ) {
    this.lr = options.learningRate ?? 0.05;
    this.strictness = options.strictness ?? 1;
    this.floor = options.weightFloor ?? 0.05;
    this.resetBlend = options.driftResetBlend ?? 0.5;
  }

  /**
   * Observe one point: score it through the ensemble, update agreement
   * stats, reweight members, and (if the monitor fires) soft-reset.
   */
  observe(point: DataPoint): { result: EnsembleResult; drifted: boolean } {
    const result = this.ensemble.update(point);
    const drifted = this.driftMonitor?.observe(point) ?? false;

    // Update agreement EWMA per member.
    for (const v of result.votes) {
      let st = this.states.get(v.detector);
      if (!st) {
        st = { name: v.detector, agreement: 1, updates: 0 };
        this.states.set(v.detector, st);
      }
      const agreed = v.flagged === result.isAnomaly ? 1 : 0;
      st.agreement += this.lr * (agreed - st.agreement);
      st.updates++;
    }

    if (drifted) {
      this.driftEvents++;
      this.softReset();
    } else {
      this.reweight();
    }
    return { result, drifted };
  }

  /** Current effective weight of a member. */
  weightOf(name: string): number | undefined {
    return this.ensemble.memberWeight(name);
  }

  /** Agreement EWMA for a member (diagnostics). */
  agreementOf(name: string): number | undefined {
    return this.states.get(name)?.agreement;
  }

  get driftCount(): number {
    return this.driftEvents;
  }

  /** weight = clamp(agreement^γ, floor, 1) */
  private reweight(): void {
    for (const { name } of this.ensemble.membersList()) {
      const st = this.states.get(name);
      if (!st || st.updates < 2) continue;
      const w = Math.max(this.floor, Math.pow(st.agreement, this.strictness));
      this.ensemble.setMemberWeight(name, w);
    }
  }

  /**
   * After a drift, blend every member's weight toward the uniform
   * weight — nobody is trusted post-shift, but history isn't fully
   * discarded.
   */
  private softReset(): void {
    const members = this.ensemble.membersList();
    if (members.length === 0) return;
    const uniform = 1; // normalized anyway by ensemble denominator
    for (const m of members) {
      const w = m.weight + this.resetBlend * (uniform - m.weight);
      this.ensemble.setMemberWeight(m.name, w);
    }
    // Agreement estimates also become less trustworthy.
    for (const st of this.states.values()) {
      st.agreement += this.resetBlend * (1 - st.agreement);
    }
  }
}
