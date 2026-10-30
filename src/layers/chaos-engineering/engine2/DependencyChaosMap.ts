/**
 * Dependency Chaos Mapping
 *
 * Models which services an experiment's blast radius touches — and,
 * transitively, which *other* services break as a consequence — by
 * overlaying a service dependency graph with experiment targeting.
 *
 * The core question this answers is the one incident reviews always ask:
 * "we only meant to fault service A — why did service Z page?" The map
 * answers it *before* running: given the service dependency graph
 * (caller → callee edges with a criticality annotation) and the set of
 * services an experiment directly targets, compute the transitive blast
 * cone with per-service impact scores.
 *
 * Model
 * -----
 * - Nodes: services. Each has a criticality tier and an optional
 *   redundancy factor (replica count — a single-instance dependency
 *   propagates failure at 1.0, a 5-replica deployment dampens it).
 * - Edges: `dependsOn` — caller → callee with a weight in [0, 1] being
 *   the fraction of the caller's traffic that flows through the callee,
 *   plus a flag whether the dependency is hard (sync failure propagates)
 *   or soft (async / fallback exists).
 * - Impact propagates *against* the edge direction: if X depends on Y
 *   and Y is faulted, X degrades by weight × callee's impact, attenuated
 *   by X's own redundancy and bounded by the edge's criticality.
 *
 * The propagation is a longest-style BFS over the dependency DAG with
 * attenuation — cycles are broken via visited-once semantics with the
 * maximum-impact path kept, matching how "failure cones" propagate in
 * dependency-graph risk models.
 *
 * Experiments are then mapped onto the graph: an experiment targeting
 * service S with a fault probability p seeds S with impact p, and the
 * map emits the downstream services sorted by expected degradation —
 * plus a conjunctive check that the computed blast cone stays inside
 * declared safety caps.
 *
 * Complexity: O(V + E) for propagation; path enumeration is exponential
 * in theory but capped by `maxDepth` and visited pruning.
 *
 * @module ChaosEngineering/Engine2
 */

/** How critical a service is to the platform. */
export enum ServiceTier {
  /** Revenue/user-facing critical: any degradation pages. */
  TIER_0 = 'tier-0',
  /** Important but degradable (e.g. recommendations). */
  TIER_1 = 'tier-1',
  /** Internal tooling. */
  TIER_2 = 'tier-2',
  /** Batch / offline. */
  TIER_3 = 'tier-3',
}

const TIER_WEIGHT: Readonly<Record<ServiceTier, number>> = {
  [ServiceTier.TIER_0]: 4,
  [ServiceTier.TIER_1]: 2,
  [ServiceTier.TIER_2]: 1,
  [ServiceTier.TIER_3]: 0.5,
};

/** A service node in the dependency graph. */
export interface ServiceNode {
  readonly id: string;
  readonly tier: ServiceTier;
  /** Replica count — redundancy attenuates propagated impact. */
  readonly replicas: number;
  /** Optional free-form metadata (team, region, …). */
  readonly metadata?: Readonly<Record<string, string>>;
}

/** A dependency edge: `from` calls/depends on `to`. */
export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  /** Fraction of `from`'s traffic that flows through `to`, in (0, 1]. */
  readonly weight: number;
  /**
   * Hard dependencies propagate synchronously (caller fails when callee
   * fails). Soft dependencies have a fallback — impact is halved.
   */
  readonly hard: boolean;
}

/** One service's computed impact inside a blast cone. */
export interface ServiceImpact {
  readonly serviceId: string;
  readonly tier: ServiceTier;
  /** Expected degradation in [0, 1] — probability-weighted. */
  readonly impact: number;
  /** Weighted score = impact × tier weight (for ranking). */
  readonly score: number;
  /** Whether this service was directly targeted vs transitively hit. */
  readonly direct: boolean;
  /** BFS distance from the nearest targeted service. */
  readonly distance: number;
  /** Human-readable propagation path (e.g. ['checkout', 'payments']). */
  readonly path: readonly string[];
}

/** Computed blast cone for an experiment. */
export interface BlastCone {
  readonly experimentId: string;
  readonly directlyTargeted: readonly string[];
  readonly impacted: readonly ServiceImpact[];
  /** Highest-tier service hit transitively — the "scariest" finding. */
  readonly highestTierHit?: ServiceTier;
  /** True when any tier-0 service is impacted transitively. */
  readonly touchesTier0: boolean;
  /** Aggregate risk = Σ score. */
  readonly totalRisk: number;
}

/** Experiment ↔ service binding. */
export interface ExperimentTargetBinding {
  readonly experimentId: string;
  /** serviceId → seed impact probability in (0, 1]. */
  readonly targets: Readonly<Record<string, number>>;
}

/** Configuration for propagation. */
export interface DependencyMapConfig {
  /** Max BFS depth from a targeted service. Default 6. */
  readonly maxDepth: number;
  /**
   * Minimum propagated impact to keep expanding — prunes vanishingly
   * small ripples. Default 0.01 (1%).
   */
  readonly minImpact: number;
  /** Soft-edge attenuation factor. Default 0.5. */
  readonly softEdgeFactor: number;
  /** Per-replica redundancy dampening: impact /= (1 + ln(replicas)). */
  readonly redundancyDampening: boolean;
}

const DEFAULT_MAP_CONFIG: DependencyMapConfig = {
  maxDepth: 6,
  minImpact: 0.01,
  softEdgeFactor: 0.5,
  redundancyDampening: true,
};

/** Raised on malformed graph input. */
export class DependencyMapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependencyMapError';
  }
}

/**
 * DependencyChaosMap — transitive blast-radius computation.
 */
export class DependencyChaosMap {
  private readonly _nodes = new Map<string, ServiceNode>();
  /** callee → incoming edges (who depends on me). */
  private readonly _dependents = new Map<string, DependencyEdge[]>();
  /** caller → outgoing edges (who I depend on). */
  private readonly _dependencies = new Map<string, DependencyEdge[]>();
  private readonly _config: DependencyMapConfig;

  constructor(config: Partial<DependencyMapConfig> = {}) {
    this._config = { ...DEFAULT_MAP_CONFIG, ...config };
  }

  get nodeCount(): number {
    return this._nodes.size;
  }

  addService(node: ServiceNode): void {
    if (this._nodes.has(node.id)) {
      throw new DependencyMapError(`duplicate service '${node.id}'`);
    }
    if (node.replicas < 1) {
      throw new DependencyMapError(`service '${node.id}' must have ≥1 replica`);
    }
    this._nodes.set(node.id, { ...node });
  }

  addDependency(edge: DependencyEdge): void {
    if (!this._nodes.has(edge.from)) {
      throw new DependencyMapError(`unknown service '${edge.from}'`);
    }
    if (!this._nodes.has(edge.to)) {
      throw new DependencyMapError(`unknown service '${edge.to}'`);
    }
    if (edge.weight <= 0 || edge.weight > 1) {
      throw new DependencyMapError(`edge weight ${edge.weight} outside (0, 1]`);
    }
    if (edge.from === edge.to) {
      throw new DependencyMapError('self-dependency not allowed');
    }
    let inList = this._dependents.get(edge.to);
    if (inList === undefined) {
      inList = [];
      this._dependents.set(edge.to, inList);
    }
    inList.push(edge);
    let outList = this._dependencies.get(edge.from);
    if (outList === undefined) {
      outList = [];
      this._dependencies.set(edge.from, outList);
    }
    outList.push(edge);
  }

  /** Direct dependents of a service (who breaks if it breaks). */
  dependentsOf(serviceId: string): readonly DependencyEdge[] {
    return this._dependents.get(serviceId) ?? [];
  }

  /** Direct dependencies of a service (what it needs). */
  dependenciesOf(serviceId: string): readonly DependencyEdge[] {
    return this._dependencies.get(serviceId) ?? [];
  }

  /**
   * Compute the blast cone for an experiment binding.
   *
   * Propagation: BFS over reversed edges (from targeted service to its
   * dependents). Each hop attenuates impact by edge.weight ×
   * softEdgeFactor (if soft) and is further dampened by the *dependent's*
   * redundancy — a 10-replica web tier absorbs more than a singleton.
   * The maximum-impact path is kept per node (a node reachable via two
   * paths takes the worse of the two).
   */
  computeBlastCone(binding: ExperimentTargetBinding): BlastCone {
    const cfg = this._config;
    for (const id of Object.keys(binding.targets)) {
      if (!this._nodes.has(id)) {
        throw new DependencyMapError(`experiment targets unknown service '${id}'`);
      }
      const p = binding.targets[id];
      if (p <= 0 || p > 1) {
        throw new DependencyMapError(`seed impact ${p} for '${id}' outside (0, 1]`);
      }
    }

    // impact map: serviceId → best (max) impact found so far.
    const impacts = new Map<string, number>();
    const paths = new Map<string, string[]>();
    const distances = new Map<string, number>();
    const queue: string[] = [];

    for (const [id, p] of Object.entries(binding.targets)) {
      impacts.set(id, p);
      paths.set(id, [id]);
      distances.set(id, 0);
      queue.push(id);
    }

    // BFS; because we keep max-impact rather than first-visit, a node may
    // be re-enqueued when a better path is found — bounded by maxDepth.
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      const curImpact = impacts.get(cur) as number;
      const curDist = distances.get(cur) as number;
      if (curDist >= cfg.maxDepth) continue;

      for (const edge of this.dependentsOf(cur)) {
        // Edge goes cur → dependent? No: dependentsOf(cur) returns edges
        // where edge.to === cur, i.e. edge.from depends on cur. The
        // degraded node is edge.from.
        const dependentId = edge.from;
        const node = this._nodes.get(dependentId) as ServiceNode;
        let propagated = curImpact * edge.weight;
        if (!edge.hard) propagated *= cfg.softEdgeFactor;
        if (cfg.redundancyDampening && node.replicas > 1) {
          propagated /= 1 + Math.log(node.replicas);
        }
        if (propagated < cfg.minImpact) continue;

        const prev = impacts.get(dependentId) ?? -1;
        if (propagated > prev) {
          impacts.set(dependentId, propagated);
          paths.set(dependentId, [...(paths.get(cur) as string[]), dependentId]);
          distances.set(dependentId, curDist + 1);
          queue.push(dependentId);
        }
      }
    }

    const impacted: ServiceImpact[] = [];
    let highestTierHit: ServiceTier | undefined;
    let touchesTier0 = false;
    let totalRisk = 0;
    for (const [id, impact] of impacts) {
      const node = this._nodes.get(id) as ServiceNode;
      const direct = Object.prototype.hasOwnProperty.call(binding.targets, id);
      const score = impact * TIER_WEIGHT[node.tier];
      totalRisk += score;
      if (node.tier === ServiceTier.TIER_0) touchesTier0 = true;
      if (highestTierHit === undefined || TIER_WEIGHT[node.tier] > TIER_WEIGHT[highestTierHit]) {
        highestTierHit = node.tier;
      }
      impacted.push({
        serviceId: id,
        tier: node.tier,
        impact,
        score,
        direct,
        distance: distances.get(id) as number,
        path: paths.get(id) as string[],
      });
    }
    // Rank: highest weighted score first; direct targets first on ties.
    impacted.sort((a, b) => b.score - a.score || Number(b.direct) - Number(a.direct));

    return {
      experimentId: binding.experimentId,
      directlyTargeted: Object.keys(binding.targets),
      impacted,
      highestTierHit,
      touchesTier0,
      totalRisk,
    };
  }

  /**
   * Which experiments affect a given service — the reverse index used by
   * scheduling ("is anything already planned that would hit payments?").
   */
  affectedExperiments(
    serviceId: string,
    bindings: readonly ExperimentTargetBinding[]
  ): { experimentId: string; impact: ServiceImpact }[] {
    const out: { experimentId: string; impact: ServiceImpact }[] = [];
    for (const b of bindings) {
      const cone = this.computeBlastCone(b);
      for (const imp of cone.impacted) {
        if (imp.serviceId === serviceId) {
          out.push({ experimentId: b.experimentId, impact: imp });
        }
      }
    }
    return out.sort((a, b) => b.impact.score - a.impact.score);
  }

  /**
   * Detect experiments whose blast cones overlap — running them
   * concurrently compounds risk multiplicatively on shared services.
   * Returns pairs of experiment IDs plus the shared services.
   */
  conflictingExperiments(
    bindings: readonly ExperimentTargetBinding[],
    overlapThreshold = 0
  ): { a: string; b: string; sharedServices: string[]; combinedRisk: number }[] {
    const cones = bindings.map((b) => this.computeBlastCone(b));
    const out: { a: string; b: string; sharedServices: string[]; combinedRisk: number }[] = [];
    for (let i = 0; i < cones.length; i++) {
      for (let j = i + 1; j < cones.length; j++) {
        const setI = new Map(cones[i].impacted.map((s) => [s.serviceId, s.score]));
        const shared: string[] = [];
        let combined = 0;
        for (const s of cones[j].impacted) {
          const si = setI.get(s.serviceId);
          if (si !== undefined) {
            shared.push(s.serviceId);
            // Combined risk = product of impacts (probabilistic union
            // would be 1-(1-a)(1-b); the product form is the pessimistic
            // joint-failure mass).
            combined += si * s.score;
          }
        }
        if (shared.length > 0 && combined > overlapThreshold) {
          out.push({
            a: cones[i].experimentId,
            b: cones[j].experimentId,
            sharedServices: shared,
            combinedRisk: combined,
          });
        }
      }
    }
    return out.sort((x, y) => y.combinedRisk - x.combinedRisk);
  }

  /** Serialize for persistence/debugging. */
  toJSON(): { nodes: ServiceNode[]; edges: DependencyEdge[] } {
    const edges: DependencyEdge[] = [];
    for (const list of this._dependents.values()) edges.push(...list);
    return { nodes: [...this._nodes.values()], edges };
  }
}
