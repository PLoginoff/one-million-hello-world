/**
 * Onboarding Engine2 — Funnel Analytics
 *
 * FunnelTracker counts transitions; this module turns raw counts into the
 * analytics views product teams actually read:
 *
 *   - per-step conversion (completed / entered),
 *   - step-to-step transition rates in declared order (the real funnel —
 *     a step's conversion is meaningless if nobody reaches it),
 *   - biggest-drop analysis ("where do we lose the most people?"),
 *   - cohort comparison (e.g. mobile vs desktop contexts).
 *
 * Data source is a `RunSnapshot` — a projection of FlowRun state so the
 * analyzer works on tests, replays and historical exports, not just the
 * live engine.
 *
 * Complexity: O(runs + steps) per build; transitions counted in one pass.
 *
 * @module OnboardingLayer/Engine2
 */

import { FlowDefinition, StepId } from '../flow/FlowTypes';

/** Minimal run shape the analyzer needs — engine-agnostic. */
export interface RunSnapshot {
  readonly runId: string;
  readonly flowId: string;
  /** Ordered step ids this run visited (completed OR skipped OR failed). */
  readonly visited: readonly StepId[];
  /** Step the run is currently on, if still in progress. */
  readonly currentStep: StepId | null;
  readonly completed: boolean;
  /** Free-form cohort key — plan, platform, experiment bucket. */
  readonly cohort?: string;
}

export interface StepConversionRow {
  readonly stepId: string;
  /** Runs that visited (entered) this step. */
  readonly entered: number;
  /** Runs whose NEXT visited step exists — they moved on. */
  readonly advanced: number;
  /** Runs whose current step == this step (still stuck here). */
  readonly stuckHere: number;
  /** Runs that ended (completed or stopped) without advancing past it. */
  readonly droppedHere: number;
  /** advanced / entered. */
  readonly transitionRate: number;
}

export interface FunnelReport {
  readonly flowId: string;
  readonly totalRuns: number;
  readonly completedRuns: number;
  /** completedRuns / totalRuns. */
  readonly overallConversion: number;
  /** One row per declared step, in declared order. */
  readonly steps: readonly StepConversionRow[];
  /** Step with the worst transitionRate (null when no data). */
  readonly biggestDrop: StepId | null;
}

export class FunnelAnalytics {
  /**
   * Build the funnel for one flow over a set of runs. Steps not in the
   * declared order (variants, personalized flows) are ignored for
   * transition math — the funnel is defined by the canonical order.
   */
  build(def: FlowDefinition, runs: readonly RunSnapshot[]): FunnelReport {
    const order = def.steps.map((s) => s.id);
    const orderIdx = new Map(order.map((id, i) => [id, i]));
    const mine = runs.filter((r) => r.flowId === def.flowId);

    const entered = new Map<StepId, number>();
    const advanced = new Map<StepId, number>();
    const stuck = new Map<StepId, number>();
    const dropped = new Map<StepId, number>();
    for (const id of order) {
      entered.set(id, 0);
      advanced.set(id, 0);
      stuck.set(id, 0);
      dropped.set(id, 0);
    }

    let completedRuns = 0;
    for (const run of mine) {
      if (run.completed) completedRuns++;
      // Canonical-order visited positions, sorted: a variant may visit
      // steps out of order; the funnel compares canonical positions.
      const positions = run.visited
        .map((id) => orderIdx.get(id))
        .filter((i): i is number => i !== undefined)
        .sort((a, b) => a - b);

      for (const pos of positions) {
        const id = order[pos];
        entered.set(id, entered.get(id)! + 1);
      }
      // A run "advanced" past position p when it visited anything at p+1
      // or beyond — covers multi-step jumps (branching skips).
      const maxPos = positions.length === 0 ? -1 : positions[positions.length - 1];
      for (const pos of positions) {
        if (pos < maxPos) {
          const id = order[pos];
          advanced.set(id, advanced.get(id)! + 1);
        }
      }

      const cur = run.currentStep;
      if (cur !== null && orderIdx.has(cur)) {
        stuck.set(cur, stuck.get(cur)! + 1);
      } else if (!run.completed && positions.length > 0) {
        // Abandoned at their furthest canonical step.
        const id = order[maxPos];
        dropped.set(id, dropped.get(id)! + 1);
      }
    }

    const steps: StepConversionRow[] = order.map((stepId) => {
      const e = entered.get(stepId)!;
      const a = advanced.get(stepId)!;
      return {
        stepId,
        entered: e,
        advanced: a,
        stuckHere: stuck.get(stepId)!,
        droppedHere: dropped.get(stepId)!,
        transitionRate: e === 0 ? 0 : a / e,
      };
    });

    const biggestDrop = steps
      .filter((s) => s.entered > 0)
      .sort((a, b) => a.transitionRate - b.transitionRate)[0]?.stepId ?? null;

    return {
      flowId: def.flowId,
      totalRuns: mine.length,
      completedRuns,
      overallConversion: mine.length === 0 ? 0 : completedRuns / mine.length,
      steps,
      biggestDrop,
    };
  }

  /**
   * Split runs by `cohort` and build a funnel per value — the primitive
   * behind "compare mobile vs web onboarding" dashboards.
   */
  byCohort(
    def: FlowDefinition,
    runs: readonly RunSnapshot[]
  ): Map<string, FunnelReport> {
    const groups = new Map<string, RunSnapshot[]>();
    for (const r of runs) {
      const key = r.cohort ?? '(none)';
      const list = groups.get(key) ?? [];
      list.push(r);
      groups.set(key, list);
    }
    const out = new Map<string, FunnelReport>();
    for (const [cohort, rs] of groups) out.set(cohort, this.build(def, rs));
    return out;
  }
}
