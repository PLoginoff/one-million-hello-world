/**
 * Run Store
 *
 * In-memory persistence for {@link FlowRun}s. Runs are stored by runId and
 * indexed by (userId, flowId) so an engine can resume a user's in-flight
 * onboarding across sessions.
 *
 * `snapshot`/`restore` serialize a run to a plain JSON-safe structure —
 * the seam where a real implementation would write to durable storage.
 *
 * @module OnboardingLayer/Flow
 */

import { FlowRun, FlowError, StepProgress } from './FlowTypes';

/** JSON-safe run shape for persistence. */
export interface RunSnapshot {
  runId: string;
  flowId: string;
  userId: string;
  variantId: string | null;
  state: FlowRun['state'];
  stepOrder: string[];
  cursor: number;
  steps: [string, StepProgress][];
  startedAt: number;
  lastActiveAt: number;
  completedAt: number | null;
  data: Record<string, unknown>;
}

export class RunStore {
  private readonly _runs = new Map<string, FlowRun>();
  private readonly _byUserFlow = new Map<string, string>(); // "user|flow" → runId

  /** Persist a run (insert or replace). */
  save(run: FlowRun): void {
    this._runs.set(run.runId, run);
    this._byUserFlow.set(`${run.userId}|${run.flowId}`, run.runId);
  }

  get(runId: string): FlowRun | null {
    return this._runs.get(runId) ?? null;
  }

  getOrThrow(runId: string): FlowRun {
    const r = this.get(runId);
    if (!r) throw new FlowError('RUN_NOT_FOUND', `run '${runId}' not found`);
    return r;
  }

  /** A user's most recent run for a flow, or null. */
  findByUserFlow(userId: string, flowId: string): FlowRun | null {
    const id = this._byUserFlow.get(`${userId}|${flowId}`);
    return id ? this.get(id) : null;
  }

  /** All runs, optionally filtered by state. */
  all(state?: FlowRun['state']): readonly FlowRun[] {
    const runs = Array.from(this._runs.values());
    return state ? runs.filter((r) => r.state === state) : runs;
  }

  delete(runId: string): boolean {
    const r = this._runs.get(runId);
    if (!r) return false;
    this._runs.delete(runId);
    this._byUserFlow.delete(`${r.userId}|${r.flowId}`);
    return true;
  }

  // ---------------------------------------------------------- serialization

  /**
   * Serialize a run to JSON-safe form. The Map inside `steps` becomes an
   * array of [stepId, progress] pairs.
   */
  snapshot(runId: string): RunSnapshot {
    const r = this.getOrThrow(runId);
    return {
      runId: r.runId,
      flowId: r.flowId,
      userId: r.userId,
      variantId: r.variantId,
      state: r.state,
      stepOrder: [...r.stepOrder],
      cursor: r.cursor,
      steps: Array.from(r.steps.entries()),
      startedAt: r.startedAt,
      lastActiveAt: r.lastActiveAt,
      completedAt: r.completedAt,
      data: { ...r.data },
    };
  }

  /**
   * Rehydrate a run from a snapshot and persist it. Useful for resuming a
   * session in a fresh engine instance.
   */
  restore(snap: RunSnapshot): FlowRun {
    const run: FlowRun = {
      runId: snap.runId,
      flowId: snap.flowId,
      userId: snap.userId,
      variantId: snap.variantId,
      state: snap.state,
      stepOrder: [...snap.stepOrder],
      cursor: snap.cursor,
      steps: new Map(snap.steps.map(([k, v]) => [k, { ...v }])),
      startedAt: snap.startedAt,
      lastActiveAt: snap.lastActiveAt,
      completedAt: snap.completedAt,
      data: { ...snap.data },
    };
    this.save(run);
    return run;
  }
}
