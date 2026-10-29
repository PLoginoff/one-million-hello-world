/**
 * Funnel Tracker
 *
 * Counts step transitions across all runs of a flow to produce drop-off
 * funnel metrics: how many users entered each step, completed it, skipped
 * it, or failed validation.
 *
 * Because variant step orders differ, the funnel is keyed by stepId (not
 * position); drop-off is computed against the flow's DECLARED order.
 *
 * @module OnboardingLayer/Flow
 */

import { StepFunnel, StepId, StepStatus } from './FlowTypes';

interface Counts {
  entered: number;
  completed: number;
  skipped: number;
  failed: number;
}

export class FunnelTracker {
  /** flowId → stepId → counts */
  private readonly _counts = new Map<string, Map<StepId, Counts>>();

  /**
   * Record a step transition. `entered` fires when a step becomes active;
   * the terminal statuses fire when it resolves.
   */
  record(flowId: string, stepId: StepId, event: 'entered' | StepStatus & ('completed' | 'skipped' | 'failed')): void {
    let perFlow = this._counts.get(flowId);
    if (!perFlow) {
      perFlow = new Map();
      this._counts.set(flowId, perFlow);
    }
    let c = perFlow.get(stepId);
    if (!c) {
      c = { entered: 0, completed: 0, skipped: 0, failed: 0 };
      perFlow.set(stepId, c);
    }
    if (event === 'entered') c.entered++;
    else if (event === 'completed') c.completed++;
    else if (event === 'skipped') c.skipped++;
    else if (event === 'failed') c.failed++;
  }

  /**
   * Funnel for one flow in the given step order — pass `graph.stepIds`
   * (declared order) or a variant's resolved order.
   */
  funnel(flowId: string, order: readonly StepId[]): readonly StepFunnel[] {
    const perFlow = this._counts.get(flowId);
    return order.map((stepId) => {
      const c = perFlow?.get(stepId) ?? { entered: 0, completed: 0, skipped: 0, failed: 0 };
      const passRate = c.entered === 0 ? 1 : (c.completed + c.skipped) / c.entered;
      return { stepId, ...c, passRate };
    });
  }

  /**
   * Step with the worst pass rate (most drop-off) for a flow, or null when
   * no data. Only steps that were entered at least once are considered.
   */
  worstStep(flowId: string, order: readonly StepId[]): StepFunnel | null {
    const f = this.funnel(flowId, order).filter((s) => s.entered > 0);
    if (f.length === 0) return null;
    return f.reduce((worst, s) => (s.passRate < worst.passRate ? s : worst));
  }

  /** Total runs that entered step 1 vs completed the whole flow. */
  completionRate(flowId: string, order: readonly StepId[]): number {
    const perFlow = this._counts.get(flowId);
    if (!perFlow || order.length === 0) return 0;
    const first = perFlow.get(order[0]);
    const last = perFlow.get(order[order.length - 1]);
    if (!first || first.entered === 0 || !last) return 0;
    return (last.completed + last.skipped) / first.entered;
  }

  reset(flowId?: string): void {
    if (flowId) this._counts.delete(flowId);
    else this._counts.clear();
  }
}
