/**
 * Process Simulator — what-if execution under resource constraints.
 *
 * Given a list of {@link SimStep}s (fixed duration + resource demands)
 * and a set of {@link ResourcePool}s, simulates execution and reports
 * the makespan — "how long would this take if only N clerks were
 * available?".
 *
 * Model: each step `requires` units from named pools and has
 * `durationMs`. A step starts at the earliest time when (a) all its
 * `dependsOn` steps have finished and (b) every required pool has at
 * least that many units free. Units are tracked as per-pool multisets
 * of "busy-until" timestamps: `free(p, t) = capacity(p) − #(busy>t)`.
 *
 * Scheduling is list-scheduling in submission order (RCPSP heuristic)
 * — O(S²) passes over the pending list worst case, fine for
 * simulation sizes (S ≤ ~10k). Not an optimal solver; that's NP-hard.
 *
 * @module BpmnLayer/Engine2
 */

import { ResourcePool, SimStep, SimulationResult } from './types';

/** SimStep plus explicit dependency list (what the caller provides). */
export interface SimStepSpec extends SimStep {
  /** ids of steps that must finish before this one starts. */
  dependsOn?: string[];
}

interface SimNode {
  spec: SimStepSpec;
  scheduled: boolean;
  startAt: number;
  endAt: number;
}

export class ProcessSimulator {
  /**
   * Run a what-if simulation.
   *
   * @param steps       steps in submission order
   * @param pools       resource pools with capacities
   */
  simulate(steps: readonly SimStepSpec[], pools: readonly ResourcePool[]): SimulationResult {
    const cap = new Map(pools.map((p) => [p.name, p.capacity]));
    // Validate every required resource exists.
    for (const s of steps) {
      for (const r of Object.keys(s.requires)) {
        if (!cap.has(r)) throw new Error(`Step ${s.nodeId} requires unknown pool '${r}'`);
      }
    }

    const nodes: SimNode[] = steps.map((spec) => ({
      spec,
      scheduled: false,
      startAt: 0,
      endAt: 0,
    }));
    const byId = new Map(nodes.map((n) => [n.spec.nodeId, n]));
    for (const n of nodes) {
      for (const d of n.spec.dependsOn ?? []) {
        if (!byId.has(d)) throw new Error(`Step ${n.spec.nodeId} depends on unknown step '${d}'`);
      }
    }

    /** pool -> busy-until times (one entry per acquired unit). */
    const busy = new Map<string, number[]>();
    for (const p of pools) busy.set(p.name, []);

    const freeUnits = (pool: string, at: number): number => {
      const list = busy.get(pool)!;
      const active = list.filter((t) => t > at).length;
      return cap.get(pool)! - active;
    };
    const acquire = (spec: SimStepSpec, at: number): void => {
      for (const [pool, units] of Object.entries(spec.requires)) {
        const list = busy.get(pool)!;
        for (let i = 0; i < units; i++) list.push(at + spec.durationMs);
      }
    };
    const fits = (spec: SimStepSpec, at: number): boolean =>
      Object.entries(spec.requires).every(([pool, units]) => freeUnits(pool, at) >= units);

    const pending = new Set(nodes);
    let guard = 0;
    const maxIters = nodes.length * nodes.length * 4 + 16;

    while (pending.size > 0) {
      if (++guard > maxIters) throw new Error('Simulation did not converge — cyclic dependencies?');

      // Find the earliest start for each ready-dependency node and pick
      // the globally-earliest one we can schedule this pass.
      let scheduledAny = false;
      for (const n of [...pending]) {
        const deps = (n.spec.dependsOn ?? []).map((d) => byId.get(d)!);
        if (deps.some((d) => !d.scheduled)) continue; // deps not yet placed
        const readyAt = deps.length > 0 ? Math.max(...deps.map((d) => d.endAt)) : 0;
        if (fits(n.spec, readyAt)) {
          n.startAt = readyAt;
          n.endAt = readyAt + n.spec.durationMs;
          n.scheduled = true;
          acquire(n.spec, readyAt);
          pending.delete(n);
          scheduledAny = true;
        }
      }

      if (!scheduledAny) {
        // Bump every unscheduled node whose deps ARE placed to the
        // earliest moment one of its required pools frees a unit.
        const candidates: number[] = [];
        for (const n of pending) {
          const deps = (n.spec.dependsOn ?? []).map((d) => byId.get(d)!);
          if (deps.some((d) => !d.scheduled)) continue;
          const readyAt = deps.length > 0 ? Math.max(...deps.map((d) => d.endAt)) : 0;
          for (const pool of Object.keys(n.spec.requires)) {
            for (const t of busy.get(pool)!) {
              if (t > readyAt) candidates.push(t);
            }
          }
        }
        if (candidates.length === 0) {
          throw new Error('Simulation deadlocked — unschedulable resource demands');
        }
        const next = Math.min(...candidates);
        // Retry pending nodes at `next`.
        for (const n of [...pending]) {
          const deps = (n.spec.dependsOn ?? []).map((d) => byId.get(d)!);
          if (deps.some((d) => !d.scheduled)) continue;
          const readyAt = Math.max(
            deps.length > 0 ? Math.max(...deps.map((d) => d.endAt)) : 0,
            next
          );
          if (fits(n.spec, readyAt)) {
            n.startAt = readyAt;
            n.endAt = readyAt + n.spec.durationMs;
            n.scheduled = true;
            acquire(n.spec, readyAt);
            pending.delete(n);
          }
        }
      }
    }

    const makespan = nodes.reduce((m, n) => Math.max(m, n.endAt), 0);
    // Tightest pool = max total-busy-time / (capacity·makespan).
    let constraining: string | null = null;
    let best = -1;
    for (const p of pools) {
      if (p.capacity <= 0 || makespan === 0) continue;
      const busyTime = nodes
        .filter((n) => n.spec.requires[p.name])
        .reduce((s, n) => s + n.spec.requires[p.name]! * n.spec.durationMs, 0);
      const util = busyTime / (p.capacity * makespan);
      if (util > best) {
        best = util;
        constraining = p.name;
      }
    }

    return {
      makespanMs: makespan,
      schedule: nodes.map((n) => ({ nodeId: n.spec.nodeId, startAt: n.startAt, endAt: n.endAt })),
      constrainingResource: constraining,
    };
  }
}
