/**
 * Deployment Wave Planning
 *
 * Orders a multi-service rollout so no service goes green before the
 * dependencies it calls — a caller hitting a half-updated stack would
 * otherwise see new callers talking to old APIs.
 *
 * Algorithm: Kahn's topological sort with level batching (BFS layers).
 * Each wave = all services whose dependencies are already scheduled in
 * earlier waves → every service deploys strictly after its dependencies,
 * and independent services inside a wave may deploy concurrently. This
 * minimizes wall-clock rollout time (fewer waves) under the ordering
 * constraint — the same leveling Bazel/K8s rollout planners use.
 *
 * Cycles: services caught in a dependency cycle can never be scheduled;
 * they are reported in `plan.cyclic` instead of silently dropped, and
 * `planWaves` throws `CycleError` listing the cycle members — deploying
 * cyclic services requires the operator to break the edge explicitly.
 *
 * Cost: O(V + E) for the topological pass.
 *
 * @module BlueGreenDeployLayer/Engine2
 */

import { ServiceNode, WavePlan } from './types';

export class CycleError extends Error {
  readonly cycle: readonly string[];
  constructor(cycle: readonly string[]) {
    super(`dependency cycle among services: ${cycle.join(' -> ')}`);
    this.name = 'CycleError';
    this.cycle = cycle;
  }
}

export class WavePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WavePlanError';
  }
}

/**
 * Compute the wave plan for a service set. `strict` (default) throws on
 * cycles; `strict=false` returns a plan with `cyclic` populated and the
 * acyclic remainder scheduled — for dry-run planning UIs.
 */
export function planWaves(
  services: readonly ServiceNode[],
  opts?: { strict?: boolean }
): WavePlan {
  const strict = opts?.strict ?? true;
  const names = new Set(services.map((s) => s.name));
  const byName = new Map(services.map((s) => [s.name, s]));
  if (names.size !== services.length) {
    const seen = new Set<string>();
    const dup = services.find((s) => (seen.has(s.name) ? true : (seen.add(s.name), false)));
    throw new WavePlanError(`duplicate service '${dup?.name}'`);
  }
  for (const s of services) {
    for (const dep of s.dependsOn) {
      if (!names.has(dep)) {
        throw new WavePlanError(`'${s.name}' depends on unknown service '${dep}'`);
      }
    }
  }

  // Kahn's algorithm with level batching.
  // in-degree counts *unsatisfied dependencies*; edges point dep → dependent.
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const s of services) {
    const deps = s.dependsOn.filter((d) => names.has(d));
    indegree.set(s.name, deps.length);
    for (const d of deps) {
      const list = dependents.get(d) ?? [];
      list.push(s.name);
      dependents.set(d, list);
    }
  }

  const waves: { services: string[] }[] = [];
  const order: string[] = [];
  let frontier = services.filter((s) => (indegree.get(s.name) ?? 0) === 0).map((s) => s.name);
  // Deterministic waves: alphabetical inside a level.
  frontier.sort();
  const scheduled = new Set<string>();

  while (frontier.length > 0) {
    waves.push({ services: frontier });
    order.push(...frontier);
    const next: string[] = [];
    for (const name of frontier) {
      scheduled.add(name);
      for (const dep of dependents.get(name) ?? []) {
        const d = (indegree.get(dep) ?? 0) - 1;
        indegree.set(dep, d);
        if (d === 0) next.push(dep);
      }
    }
    next.sort();
    frontier = next;
  }

  const cyclic = services.filter((s) => !scheduled.has(s.name)).map((s) => s.name);
  if (cyclic.length > 0 && strict) {
    throw new CycleError(cyclePath(cyclic, byName));
  }
  return { waves, order, cyclic };
}

/** Extract one concrete cycle path for the error message (DFS). */
function cyclePath(cyclic: readonly string[], byName: Map<string, ServiceNode>): string[] {
  const cyclicSet = new Set(cyclic);
  const start = cyclic[0];
  const path: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = start;
  while (cur !== undefined && !seen.has(cur)) {
    path.push(cur);
    seen.add(cur);
    const node = byName.get(cur);
    cur = node?.dependsOn.find((d) => cyclicSet.has(d));
  }
  if (cur !== undefined) {
    const startIdx = path.indexOf(cur);
    path.push(cur);
    return path.slice(startIdx);
  }
  return path;
}

/**
 * Wave assignment lookup: service → wave index. Convenience for
 * dashboards that want "wave N" labels per service.
 */
export function waveIndexOf(plan: WavePlan): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  plan.waves.forEach((w, i) => {
    for (const s of w.services) out.set(s, i);
  });
  return out;
}
