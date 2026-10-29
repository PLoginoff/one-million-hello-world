/**
 * Blue-Green Deploy — Deployment Wave Planner
 *
 * Orders a fleet of services into deployment waves honoring inter-service
 * dependency edges: a service may only deploy after its dependencies deploy
 * successfully. Uses Kahn's algorithm for topological layering — each wave
 * contains every service whose dependencies are all in earlier waves, so all
 * members of a wave can deploy in parallel.
 *
 * Also detects cycles (unsatisfiable deployments) and computes the critical
 * path — the longest dependency chain, which bounds the minimum deploy time.
 *
 * @module BlueGreenDeploy/Deploy
 */

export interface ServiceNode {
  readonly serviceId: string;
  /** Services this one depends on (must deploy first). */
  readonly dependsOn: ReadonlyArray<string>;
  /** Estimated deploy duration (ms) — drives critical-path math. */
  readonly deployMs?: number;
}

export interface DeploymentWave {
  readonly index: number;
  readonly serviceIds: ReadonlyArray<string>;
  /** Sum of member deploy estimates (serial cost of the wave). */
  readonly estimatedMs: number;
}

export interface WavePlan {
  readonly waves: ReadonlyArray<DeploymentWave>;
  /** Longest dependency chain's serial deploy time (ms). */
  readonly criticalPathMs: number;
  /** Services involved in dependency cycles — cannot deploy. */
  readonly cyclic: ReadonlyArray<string>;
}

export class WavePlanner {
  /**
   * Kahn's algorithm with level tracking: repeatedly peel services whose
   * unmet-dependency count reaches zero into the next wave. Remaining nodes
   * after peeling are in cycles.
   */
  static plan(services: ReadonlyArray<ServiceNode>): WavePlan {
    const byId = new Map(services.map((s) => [s.serviceId, s]));
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const s of services) {
      indegree.set(s.serviceId, 0);
    }
    for (const s of services) {
      for (const dep of s.dependsOn) {
        if (!byId.has(dep)) {
          throw new Error(`service '${s.serviceId}' depends on unknown '${dep}'`);
        }
        indegree.set(s.serviceId, (indegree.get(s.serviceId) ?? 0) + 1);
        const list = dependents.get(dep) ?? [];
        list.push(s.serviceId);
        dependents.set(dep, list);
      }
    }

    const waves: DeploymentWave[] = [];
    const longestPath = new Map<string, number>();
    let frontier = services.filter((s) => (indegree.get(s.serviceId) ?? 0) === 0).map((s) => s.serviceId);
    const placed = new Set<string>();

    while (frontier.length > 0) {
      frontier.sort(); // deterministic wave membership
      const wave: DeploymentWave = {
        index: waves.length,
        serviceIds: [...frontier],
        estimatedMs: frontier.reduce((a, id) => a + (byId.get(id)?.deployMs ?? 0), 0),
      };
      waves.push(wave);

      const next: string[] = [];
      for (const id of frontier) {
        placed.add(id);
        const ownCost = byId.get(id)?.deployMs ?? 0;
        const predCost = longestPath.get(id) ?? 0;
        longestPath.set(id, predCost + ownCost);
        for (const dep of dependents.get(id) ?? []) {
          // Propagate critical path: dep's longest predecessor chain.
          const via = longestPath.get(id)!;
          if ((longestPath.get(dep) ?? 0) < via) {
            longestPath.set(dep, via);
          }
          const d = (indegree.get(dep) ?? 0) - 1;
          indegree.set(dep, d);
          if (d === 0) next.push(dep);
        }
      }
      frontier = next;
    }

    const cyclic = services.filter((s) => !placed.has(s.serviceId)).map((s) => s.serviceId).sort();
    const criticalPathMs = Math.max(0, ...[...longestPath.values()]);

    return { waves, criticalPathMs, cyclic };
  }

  /**
   * Wave for a specific service (or -1 if cyclic). Useful for "when does X
   * go out" queries against an approved plan.
   */
  static waveOf(plan: WavePlan, serviceId: string): number {
    for (const w of plan.waves) {
      if (w.serviceIds.includes(serviceId)) return w.index;
    }
    return -1;
  }
}
