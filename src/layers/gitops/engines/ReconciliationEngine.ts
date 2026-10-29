/**
 * Reconciliation Engine
 *
 * Applies a drift report to the live store in safe order:
 *
 *  1. Waves ascending — wave 0 fully reconciles before wave 1 starts
 *     (ArgoCD sync-wave semantics).
 *  2. Within a wave, dependency-ordered via topological sort on
 *     `dependsOn` — creates/updates run parents-first, deletes run
 *     children-first (reverse topo) so nothing is removed while a
 *     dependent still needs it.
 *  3. A failed step in a wave skips the remaining steps that transitively
 *     depend on it, but independent steps in the wave still apply —
 *     partial progress beats all-or-nothing for GitOps.
 *
 * Dependency cycles abort the wave with every step skipped.
 *
 * @module GitopsLayer/Engines
 */

import {
  DesiredRevision,
  DiffAction,
  DriftReport,
  LiveStore,
  ReconcileResult,
  ReconcileStep,
  ResourceDiff,
  StepStatus,
} from './types';

/** Optional apply hook — lets callers simulate apply failures in tests. */
export type ApplyHook = (diff: ResourceDiff, live: LiveStore) => void;

export class ReconciliationEngine {
  private readonly _live: LiveStore;
  private readonly _hook: ApplyHook | null;

  constructor(live: LiveStore, hook: ApplyHook | null = null) {
    this._live = live;
    this._hook = hook;
  }

  /**
   * Reconcile drift for a revision. Steps execute in wave order; each
   * step mutates the live store. Returns per-step outcomes.
   */
  reconcile(revision: DesiredRevision, report: DriftReport): ReconcileResult {
    const steps: ReconcileStep[] = [];
    const waves = new Map<number, ResourceDiff[]>();
    for (const d of report.diffs) {
      const arr = waves.get(d.wave) ?? [];
      arr.push(d);
      waves.set(d.wave, arr);
    }
    const waveNums = [...waves.keys()].sort((a, b) => a - b);
    const failed = new Set<string>();

    for (const wave of waveNums) {
      const diffs = waves.get(wave)!;
      const ordered = this._orderWave(diffs);
      if (ordered === null) {
        // Dependency cycle — skip the whole wave.
        for (const d of diffs) {
          steps.push({ diff: d, status: StepStatus.Skipped, error: 'dependency cycle detected' });
        }
        continue;
      }
      for (const d of ordered) {
        // Skip steps whose dependencies failed this run.
        const failedDep = d.dependsOn.find((dep) => failed.has(dep));
        if (failedDep !== undefined) {
          steps.push({
            diff: d,
            status: StepStatus.Skipped,
            error: `dependency '${failedDep}' failed to apply`,
          });
          continue;
        }
        try {
          this._apply(d, revision);
          steps.push({ diff: d, status: StepStatus.Applied, error: null });
        } catch (err) {
          failed.add(d.key);
          steps.push({
            diff: d,
            status: StepStatus.Failed,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    const applied = steps.filter((s) => s.status === StepStatus.Applied).length;
    const failedCount = steps.filter((s) => s.status === StepStatus.Failed).length;
    return {
      revisionId: revision.id,
      steps,
      applied,
      failed: failedCount,
      success: failedCount === 0 && steps.every((s) => s.status !== StepStatus.Skipped),
    };
  }

  /**
   * Topological order for a wave.
   *
   * Creates/updates: parents before children (Kahn's algorithm).
   * Deletes are re-ordered so children go first (reverse dependency
   * direction). Mixed batches keep creates+updates in topo order then
   * deletes in reverse topo order.
   *
   * Returns null on a dependency cycle.
   */
  private _orderWave(diffs: ResourceDiff[]): ResourceDiff[] | null {
    const keys = new Set(diffs.map((d) => d.key));
    const createsUpdates = diffs.filter((d) => d.action !== DiffAction.Delete);
    const deletes = diffs.filter((d) => d.action === DiffAction.Delete);

    const forward = this._topo(createsUpdates, keys, false);
    const backward = this._topo(deletes, keys, true);
    if (forward === null || backward === null) return null;
    return [...forward, ...backward];
  }

  /**
   * Kahn's algorithm. `reverse=true` inverts edge direction (for deletes).
   * Edges only count dependencies that are ALSO in the diff set — a dep
   * on an unchanged resource is already satisfied by live state.
   */
  private _topo(diffs: ResourceDiff[], inSet: Set<string>, reverse: boolean): ResourceDiff[] | null {
    const byKey = new Map(diffs.map((d) => [d.key, d]));
    const indegree = new Map<string, number>(diffs.map((d) => [d.key, 0]));
    const edges = new Map<string, string[]>();

    for (const d of diffs) {
      for (const dep of d.dependsOn) {
        if (!inSet.has(dep) || !byKey.has(dep)) continue;
        const from = reverse ? d.key : dep;
        const to = reverse ? dep : d.key;
        const list = edges.get(from) ?? [];
        list.push(to);
        edges.set(from, list);
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }

    const queue = diffs.filter((d) => (indegree.get(d.key) ?? 0) === 0).map((d) => d.key);
    const out: ResourceDiff[] = [];
    while (queue.length > 0) {
      const k = queue.shift()!;
      out.push(byKey.get(k)!);
      for (const next of edges.get(k) ?? []) {
        indegree.set(next, indegree.get(next)! - 1);
        if (indegree.get(next) === 0) queue.push(next);
      }
    }
    return out.length === diffs.length ? out : null; // leftover = cycle
  }

  private _apply(d: ResourceDiff, revision: DesiredRevision): void {
    if (this._hook) this._hook(d, this._live);
    if (d.action === DiffAction.Delete) {
      this._live.delete(d.key);
      return;
    }
    const desired = revision.resources.get(d.key);
    if (!desired) {
      throw new Error(`Desired spec for '${d.key}' missing from revision`);
    }
    this._live.set(d.key, desired);
  }
}
