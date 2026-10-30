/**
 * Workloads — realistic latency/dependency models for scenarios
 *
 * Realistic service-time models for the load engine's scenario
 * handlers. Production latencies are rarely uniform — they follow
 * heavy-tailed distributions (lognormal, Pareto) plus discrete
 * mixtures (cache hit vs miss, fast/slow path).
 *
 *  - `lognormal()` — classic service-time distribution (multiplicative
 *    noise ⇒ right-skewed, matches real p99 tails).
 *  - `pareto()` — heavy-tail model for pathological outliers.
 *  - `mixture()` — weighted discrete mixtures (e.g. 95% fast path
 *    20ms, 5% slow path 800ms).
 *  - `withJitter()` — adds multiplicative Gaussian jitter to a base
 *    latency.
 *  - `dependencyChain()` — models a request fanning out to N
 *    downstream calls (parallel: max of latencies; sequential: sum;
 *    k-of-n: k-th fastest) — the microservice fan-out pattern.
 *  - `cacheModel()` — hit/miss latency split by hit rate with
 *    stampede simulation when the cache expires.
 *
 * All samplers take a seeded PRNG for determinism.
 *
 * @module PerformanceTesting/Engine
 */



/* ------------------------------------------------------------------------ */
/* Base distributions                                                       */
/* ------------------------------------------------------------------------ */

/** Latency sampler signature shared by all workload models. */
export type LatencySampler = (rand: () => number) => number;

/** Box-Muller standard normal sample. */
function randNormal(rand: () => number): number {
  const u1 = rand() || Number.EPSILON;
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Lognormal sampler parameterized by median and sigma.
 * `median` is exp(μ); `sigma` controls tail weight (0.3 mild, 0.8 heavy).
 */
export function lognormal(medianMs: number, sigma: number): LatencySampler {
  const mu = Math.log(medianMs);
  return (rand) => Math.exp(mu + sigma * randNormal(rand));
}

/**
 * Pareto sampler: `P(X > x) = (xm/x)^alpha` — the canonical heavy tail.
 * alpha ~1.16 gives the classic "80/20" tail; lower alpha → wilder.
 */
export function pareto(minMs: number, alpha = 1.5): LatencySampler {
  return (rand) => {
    const u = rand() || Number.EPSILON;
    return minMs / Math.pow(u, 1 / alpha);
  };
}

/**
 * Gaussian sampler truncated to non-negative latencies
 * (negative draws re-sampled via rejection — bounded attempts then clamp).
 */
export function normal(meanMs: number, stddevMs: number): LatencySampler {
  return (rand) => {
    for (let i = 0; i < 8; i++) {
      const v = meanMs + stddevMs * randNormal(rand);
      if (v >= 0) return v;
    }
    return Math.max(0, meanMs);
  };
}

/**
 * Weighted discrete mixture — picks a branch by weight, then samples
 * that branch's latency. Models the fast/slow-path split (cache hit,
 * index hit, degraded backend).
 */
export function mixture(
  branches: readonly { weight: number; sampler: LatencySampler }[]
): LatencySampler {
  const total = branches.reduce((s, b) => s + b.weight, 0);
  if (total <= 0) throw new Error('mixture: nonpositive total weight');
  return (rand) => {
    let r = rand() * total;
    for (const b of branches) {
      r -= b.weight;
      if (r <= 0) return b.sampler(rand);
    }
    return branches[branches.length - 1].sampler(rand);
  };
}

/**
 * Multiplicative jitter: `base * (1 + N(0, scale))` clamped to >=0.
 * Models GC pauses, scheduling jitter on a nominal service time.
 */
export function withJitter(base: LatencySampler, scale = 0.1): LatencySampler {
  return (rand) => Math.max(0, base(rand) * (1 + scale * randNormal(rand)));
}

/* ------------------------------------------------------------------------ */
/* Dependency fan-out                                                       */
/* ------------------------------------------------------------------------ */

export type FanoutMode = 'parallel' | 'sequential' | 'k-of-n';

/**
 * Dependency chain sampler: a request calling `calls` downstream
 * services drawn from `sampler`.
 *  - parallel: latency = max(children) + overhead
 *  - sequential: latency = sum(children) + overhead
 *  - k-of-n: latency = k-th smallest + overhead (hedged requests)
 */
export function dependencyChain(
  calls: number,
  sampler: LatencySampler,
  mode: FanoutMode,
  overheadMs = 0,
  k = 1
): LatencySampler {
  return (rand) => {
    const lat = Array.from({ length: calls }, () => sampler(rand));
    switch (mode) {
      case 'parallel':
        return Math.max(...lat) + overheadMs;
      case 'sequential':
        return lat.reduce((a, b) => a + b, 0) + overheadMs;
      case 'k-of-n': {
        const sorted = [...lat].sort((a, b) => a - b);
        return sorted[Math.min(calls - 1, Math.max(0, k - 1))] + overheadMs;
      }
    }
  };
}

/* ------------------------------------------------------------------------ */
/* Cache model                                                              */
/* ------------------------------------------------------------------------ */

export interface CacheModelOptions {
  /** Cache hit latency in ms. */
  readonly hitMs: number;
  /** Cache miss latency in ms (backend fetch). */
  readonly missMs: number;
  /** Steady-state hit rate in [0,1]. */
  readonly hitRate: number;
  /** Stampede factor: when the cache expires, the first `stampedeN`
      requests share the miss — modeled by a per-key TTL event. */
  readonly stampedeN?: number;
  readonly ttlMs?: number;
}

/**
 * Cache hit/miss workload: each call independently samples hit/miss
 * per `hitRate`. For TTL-stampede behavior see {@link stampedeCache}.
 */
export function cacheModel(opts: CacheModelOptions): LatencySampler {
  return (rand) => (rand() < opts.hitRate ? opts.hitMs : opts.missMs);
}

/**
 * Stateful cache stampede model — shares a virtual clock between
 * calls. On `ttlMs` expiry the next `stampedeN` calls all miss
 * regardless of hitRate, modeling synchronized expiry stampedes.
 */
export function stampedeCache(opts: CacheModelOptions): (rand: () => number, now: number) => number {
  // next expiry boundary; -1 forces a stampede on first call
  let expiresAt = -1;
  let stampedesLeft = opts.stampedeN ?? 0;
  const stampedeN = opts.stampedeN ?? 0;
  const ttl = opts.ttlMs ?? 30_000;
  return (rand, now) => {
    if (now >= expiresAt) {
      expiresAt = now + ttl;
      stampedesLeft = stampedeN;
    }
    if (stampedesLeft > 0) {
      stampedesLeft--;
      return opts.missMs;
    }
    return rand() < opts.hitRate ? opts.hitMs : opts.missMs;
  };
}

/* ------------------------------------------------------------------------ */
/* Convenience compositions                                                 */
/* ------------------------------------------------------------------------ */

/** Typical CRUD API latency profile: mostly fast reads, few slow writes. */
export function apiWorkload(): LatencySampler {
  return mixture([
    { weight: 85, sampler: lognormal(15, 0.4) },   // fast path
    { weight: 12, sampler: lognormal(80, 0.6) },   // normal queries
    { weight: 3, sampler: lognormal(400, 0.9) },   // slow writes/aggregations
  ]);
}

/** Database-query profile: index hits vs table scans. */
export function dbWorkload(): LatencySampler {
  return mixture([
    { weight: 92, sampler: lognormal(2, 0.3) },
    { weight: 7, sampler: lognormal(40, 0.7) },
    { weight: 1, sampler: pareto(200, 1.8) },
  ]);
}
